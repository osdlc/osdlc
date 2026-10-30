//! Projection — a version snapshot rendered into per-runtime files.
//!
//! Rendering is delegated entirely to `agent-adapt` (the crate used for
//! projection): per-runtime `skills_dir`, frontmatter dialect,
//! tool-name translation, annotations passthrough, and peer-resource
//! emission are its contract as of 0.3. This module maps the store
//! snapshot into `agent_adapt::Skill` and hashes what comes back.
//!
//! # The `sw-` strip, again
//!
//! The namespace spec put the strip in two places, and
//! this is the second. [`crate::vault::read_vault_skill`] lifts our namespace
//! out of a note's frontmatter before a [`crate::SkillContent`] exists, which is what
//! makes the strip structural for anything read from a vault. But
//! `SkillContent` is a public type with a public `annotations` map, so a
//! caller can assemble one by any route it likes — from a store, a test, a
//! future adopter — and `annotations` is emitted verbatim by
//! `agent-adapt`'s renderer.
//!
//! So `to_adapt_skill` applies the same predicate at the emit seam every
//! projection passes through. It is one `retain` over a map that is normally
//! empty of our keys, against a class of bug that writes files: our
//! configuration, published into somebody else's skill directory, where the
//! reference validator rejects it as an unknown top-level key.
//!
//! **The same predicate means the same [`crate::Namespace`]**, which is why
//! [`project_skill`] takes one rather than assuming `sw-`. A vault configured
//! to `x-` and emitted under `sw-` would publish every `x-` key its author
//! wrote, and strip an `sw-` annotation that was never ours to touch — the
//! strip failing in both directions at once.

use agent_adapt::RuntimeId;
use sha2::{Digest, Sha256};

use crate::content::SkillProjection;
use crate::error::CoreError;
use crate::namespace::Namespace;

/// One file projection wants on disk, relative to a destination root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectedFile {
    /// Forward-slashed, destination-root-relative.
    pub relative_path: String,
    /// The file's bytes.
    pub content: Vec<u8>,
    /// Whether the file is executable.
    pub executable: bool,
}

/// Renders one snapshot for every given runtime target.
///
/// Output is sorted by path — the stable order the hash, the manifest, and
/// the tests all rely on. Unknown target names are refused, not skipped: a
/// destination pointing at a target this build cannot render is a
/// configuration error, and skipping would under-publish silently.
///
/// `ns` is the namespace stripped from `annotations` on the way out, and it
/// must be the one the snapshot was read under. See the module documentation.
///
/// Carries no per-target override block: the callers that hold one publish
/// through [`project_skill_reporting`], which takes the destination to look
/// one up by.
pub fn project_skill(
    snapshot: &SkillProjection,
    targets: &[String],
    ns: &Namespace,
) -> Result<Vec<ProjectedFile>, CoreError> {
    project_skill_reporting(snapshot, targets, ns, None).map(|(files, _)| files)
}

/// One `sw-overrides` key that changed nothing at the destination it was
/// written for.
///
/// A diagnostic, never a refusal: the note publishes exactly as it would
/// have, and the report says the key is spending an author's attention on
/// something the projection already emits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedundantOverride {
    /// The destination, canonically named.
    pub target: String,
    /// The key, spelled as the block spells it.
    pub key: String,
}

impl std::fmt::Display for RedundantOverride {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "`{}` for `{}` is what the projection already writes",
            self.key, self.target
        )
    }
}

/// [`project_skill`], plus the redundant-override diagnostics the render
/// produced.
///
/// Two entry points rather than one because the diagnostic is not a file and
/// most callers want files. Whichever is called, the render happens once.
///
/// `overrides_target` is the canonical destination whose `sw-overrides` block
/// this render applies — the publish path's own destination, not the runtime
/// target, which several destinations share. `None` renders no override block.
///
/// # Errors
///
/// Every one [`project_skill`] raises.
pub fn project_skill_reporting(
    snapshot: &SkillProjection,
    targets: &[String],
    ns: &Namespace,
    overrides_target: Option<&str>,
) -> Result<(Vec<ProjectedFile>, Vec<RedundantOverride>), CoreError> {
    let mut out = Vec::new();
    let mut redundant = Vec::new();
    for target in targets {
        let id = parse_runtime_target(target)?;
        let skill = to_adapt_skill(snapshot, ns, overrides_target);
        let runtime = agent_adapt::runtimes::skill_renderer_for(id)
            .ok_or_else(|| CoreError::Projection(format!("{target}: runtime renders no skills")))?;
        let files = runtime
            .render_skill(&skill)
            .map_err(|e| refusal(target, e))?;
        // The renderer applies the block; this asks the same render what it
        // changed. `render_skill_md` and its reporting sibling produce the
        // same bytes, so the report cannot describe a different file.
        let keys = redundant_override_keys(snapshot, target, ns, overrides_target)?;
        redundant.extend(keys.into_iter().map(|key| RedundantOverride {
            target: overrides_target.unwrap_or(target).to_owned(),
            key,
        }));
        for file in files {
            out.push(ProjectedFile {
                relative_path: forward_slashed(&file.path),
                content: file.content,
                executable: file.executable,
            });
        }
    }
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok((out, redundant))
}

/// Which of one snapshot's override keys for `target` the render already
/// writes byte for byte.
///
/// Empty when the note carries no block for this destination, which is the
/// ordinary note, and empty when the runtime renders no skills — there is no
/// render for a key to be redundant against.
///
/// `target` is a runtime target name, the vocabulary [`project_skill`] takes;
/// `overrides_target` is the canonical destination whose block to score, or
/// `None` for a snapshot that carries none.
///
/// # Errors
///
/// An unknown target name, and the refusal a render raises.
pub fn redundant_override_keys(
    snapshot: &SkillProjection,
    target: &str,
    ns: &Namespace,
    overrides_target: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    let id = parse_runtime_target(target)?;
    let skill = to_adapt_skill(snapshot, ns, overrides_target);
    if skill.overrides.is_empty() {
        return Ok(Vec::new());
    }
    match agent_adapt::runtimes::redundant_skill_overrides(id, &skill) {
        None => Ok(Vec::new()),
        Some(report) => report.map_err(|e| refusal(target, e)),
    }
}

/// The aggregate content hash over a projected (or manifested) file set:
/// SHA-256 over `path`, an exec marker, and `content`, in sorted path order.
///
/// The hash covers exec bits and does not depend on emission order.
pub fn content_hash(files: &[ProjectedFile]) -> String {
    let mut sorted: Vec<&ProjectedFile> = files.iter().collect();
    sorted.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    let mut hasher = Sha256::new();
    for f in sorted {
        hasher.update(f.relative_path.as_bytes());
        hasher.update(if f.executable { b"x" } else { b"-" });
        hasher.update(&f.content);
    }
    format!("{:x}", hasher.finalize())
}

/// Hash of one file's bytes — what the manifest records per file.
pub fn file_hash(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

/// A render failure, as the variant that says what actually happened.
///
/// `agent-adapt` refuses a resource path that would not land inside the skill
/// directory with `Error::UnsafePath`, and that is a **refusal**, not a
/// rendering fault. The distinction is not cosmetic: a host classifies
/// [`CoreError::Refused`] as denied and [`CoreError::Projection`] as an error,
/// so an attempted path escape logged as a generic render failure is an
/// attempted path escape nobody will ever notice.
///
/// The token is `unsafe-path`, the same one
/// [`crate::guard::resolve_write_path`] refuses under: two layers apply one
/// rule, so they answer in one word. Everything else `agent-adapt` can fail
/// with is a projection error, unchanged.
fn refusal(target: &str, error: agent_adapt::Error) -> CoreError {
    match error {
        agent_adapt::Error::UnsafePath { path, reason } => CoreError::refused(
            "unsafe-path",
            format!(
                "{target}: `{path}` would not stay inside the skill directory — {reason}. \
                 Nothing was rendered, and nothing was written"
            ),
        ),
        other => CoreError::Projection(other.to_string()),
    }
}

/// Maps a stored target name to agent-adapt's id. Only the seeded eight —
/// `npm-package` renders but is deliberately not part of the product surface.
pub(crate) fn parse_runtime_target(target: &str) -> Result<RuntimeId, CoreError> {
    match target {
        "claude-code" => Ok(RuntimeId::ClaudeCode),
        "antigravity" => Ok(RuntimeId::Antigravity),
        "codex-cli" => Ok(RuntimeId::CodexCli),
        "opencode" => Ok(RuntimeId::OpenCode),
        "amp" => Ok(RuntimeId::Amp),
        "cursor" => Ok(RuntimeId::Cursor),
        "github-copilot" => Ok(RuntimeId::GithubCopilot),
        "pi" => Ok(RuntimeId::Pi),
        other => Err(CoreError::Projection(format!(
            "unsupported runtime target: {other}"
        ))),
    }
}

/// Renders one note as an **agent persona** for every given runtime target.
///
/// The peer of [`project_skill`], and deliberately a separate entry point
/// rather than a branch inside it: the two produce different files at
/// different paths from different halves of the same note, and a caller
/// holding an `sw-kind: agent` note has already decided which it wants.
///
/// A runtime with no agent layout is refused by name rather than skipped. The
/// portable Agent Skills shape is the one built-in without one — it defines
/// `skills/` and `AGENTS.md` and no per-agent file — so an agent published
/// there refuses `no-renderer` instead of being written to a path the standard
/// does not define.
pub fn project_agent(
    snapshot: &SkillProjection,
    targets: &[String],
    ns: &Namespace,
) -> Result<Vec<ProjectedFile>, CoreError> {
    let agent = to_adapt_agent(snapshot, ns)?;
    let mut out = Vec::new();
    for target in targets {
        let id = parse_runtime_target(target)?;
        let runtime = agent_adapt::runtimes::agent_renderer_for(id).ok_or_else(|| {
            CoreError::refused(
                "no-renderer",
                format!("{target} has no agent layout, so an agent cannot be published there"),
            )
        })?;
        let files = runtime
            .render_agent(&agent)
            .map_err(|e| refusal(target, e))?;
        for file in files {
            out.push(ProjectedFile {
                relative_path: forward_slashed(&file.path),
                content: file.content,
                executable: file.executable,
            });
        }
    }
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

/// Renders one note as a **slash command** for every given runtime target.
///
/// The third entry point beside [`project_skill`] and [`project_agent`], and
/// separate for the same reason: a different file at a different path, from a
/// different reading of the same note.
///
/// A runtime with no command layout is refused by name.
/// [`agent_adapt::runtimes::command_renderer_for`] is `Some` for Claude Code,
/// Codex CLI, OpenCode and GitHub Copilot; `None` for Amp (no
/// documented command format) and the packaging targets (`NpmPackage`,
/// `Portable`) — so a command published to one of those refuses
/// `no-renderer` instead of landing somewhere the harness never looks.
///
/// `overrides_target` is the canonical destination whose `sw-overrides` block
/// this render applies, or `None` for a snapshot that carries none.
pub fn project_command(
    snapshot: &SkillProjection,
    targets: &[String],
    ns: &Namespace,
    overrides_target: Option<&str>,
) -> Result<Vec<ProjectedFile>, CoreError> {
    let mut out = Vec::new();
    for target in targets {
        let command = to_adapt_command(snapshot, ns, overrides_target)?;
        let id = parse_runtime_target(target)?;
        let runtime = agent_adapt::runtimes::command_renderer_for(id).ok_or_else(|| {
            CoreError::refused(
                "no-renderer",
                format!("{target} has no command layout, so a command cannot be published there"),
            )
        })?;
        let files = runtime
            .render_command(&command)
            .map_err(|e| refusal(target, e))?;
        for file in files {
            out.push(ProjectedFile {
                relative_path: forward_slashed(&file.path),
                content: file.content,
                executable: file.executable,
            });
        }
    }
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

/// Renders a plugin's hooks as the bytes of one `hooks/hooks.json`, in the
/// shape the target's own `HookCapability` writes.
///
/// The fourth entry point, and the one that is not per note: a harness reads
/// one hooks file per plugin, so every hook of a pack renders together or the
/// second one overwrites the first. [`crate::export`] collects the members
/// and calls this once per plugin per root.
///
/// Nothing is written for an empty list — a pack with no hooks has no hooks
/// file, rather than one saying so.
///
/// # Errors
///
/// * `refused: no-renderer` — the target has no hooks layout at all.
/// * [`CoreError::Projection`] -- the target does not carry one of the events; see `agent_adapt::render::render_hooks_json`'s docs (packages/rust/agent-adapt/src/render/hooks_json.rs) for the refusal contract.
pub fn project_plugin_hooks(
    hooks: &[agent_adapt::Hook],
    target: &str,
) -> Result<Option<Vec<u8>>, CoreError> {
    if hooks.is_empty() {
        return Ok(None);
    }
    let id = parse_runtime_target(target)?;
    let Some(renderer) = agent_adapt::runtimes::hook_renderer_for(id) else {
        return Err(CoreError::refused(
            "no-renderer",
            format!("{target} has no hooks layout, so a hook cannot be published there"),
        ));
    };
    let files = renderer
        .render_hooks(hooks)
        .map_err(|e| refusal(target, e))?;
    let Some(file) = files.into_iter().next() else {
        return Ok(None);
    };
    // One trailing newline, as every other file a build writes ends.
    let mut bytes = file.content;
    bytes.push(b'\n');
    Ok(Some(bytes))
}

/// The note's projectable half as a hook.
///
/// A hook note's own frontmatter is the standard-shaped half of the note —
/// `event`, `matcher`, `type` and the payload keys are the harness's own
/// vocabulary, not ours — so they arrive here in
/// [`crate::content::SkillContent::annotations`], the map every key this
/// build does not model lands in. Reading them at the projection rather than
/// in [`crate::vault::read_vault_skill`] is what keeps a *skill* note's
/// foreign `type:` or `command:` key untouched: those keys are a hook's only
/// where the resolved kind says hook, and the reader resolves no kind.
///
/// # The body is the script, or the prompt
///
/// A command hook's body is its script and a prompt hook's body is its
/// prompt, because that is what an author edits a hook note to write. A note
/// that states its payload twice — a body *and* the matching key — is refused
/// rather than silently preferring one: both were typed on purpose, and
/// picking a winner is how the other one disappears.
///
/// `overrides_target` is the canonical destination whose `sw-overrides` block
/// this render applies, or `None` for a snapshot that carries none.
///
/// # Errors
///
/// * `refused: hook-missing-event` — no `event` key. A hook with no event
///   never fires, and defaulting one would install it on the wrong trigger.
/// * `refused: unknown-hook-type` — `type` names something outside
///   [`agent_adapt::HookType`].
/// * `refused: hook-payload-twice` — the body and the payload key both carry
///   the work.
/// * `refused: hook-missing-payload` — a command, http or prompt hook with
///   nothing to run.
/// * `refused: malformed-hook` — a hook key of the wrong shape.
pub fn to_adapt_hook(
    snapshot: &SkillProjection,
    overrides_target: Option<&str>,
) -> Result<agent_adapt::Hook, CoreError> {
    let content = &snapshot.content;
    let slug = agent_adapt::naming::slugify_skill_name(&content.name).map_err(|e| {
        CoreError::refused(
            "unsafe-path",
            format!("`{}` cannot become a hook name: {e}", content.name),
        )
    })?;
    let keys = &content.annotations;
    let name = content.name.as_str();

    let event = hook_string(keys, "event", name)?.ok_or_else(|| {
        CoreError::refused(
            "hook-missing-event",
            format!("hook `{name}` names no `event`, so nothing would ever fire it"),
        )
    })?;
    let r#type = match hook_string(keys, "type", name)? {
        None => agent_adapt::HookType::Command,
        Some(spelled) => spelled
            .parse::<agent_adapt::HookType>()
            .map_err(|e| CoreError::refused("unknown-hook-type", format!("hook `{name}`: {e}")))?,
    };

    let body = content.body.trim();
    let mut hook = agent_adapt::Hook::new(&content.name, &slug, &event);
    hook.description = Some(content.description.clone());
    hook.matcher = hook_string(keys, "matcher", name)?;
    hook.r#type = Some(r#type);
    hook.command = hook_string(keys, "command", name)?;
    hook.url = hook_string(keys, "url", name)?;
    hook.prompt = hook_string(keys, "prompt", name)?;
    hook.r#if = hook_string(keys, "if", name)?;
    hook.r#async = hook_bool(keys, "async", name)?;
    hook.once = hook_bool(keys, "once", name)?;
    hook.timeout_ms = hook_int(keys, "timeout", name)?.unwrap_or(0);
    hook.tags = content.tags.clone();
    hook.overrides = overrides_target
        .and_then(|dest| content.overrides.get(dest))
        .cloned()
        .unwrap_or_default();

    // The body carries the payload for the two types that have one to write.
    let payload = match r#type {
        agent_adapt::HookType::Command => Some(("command", &mut hook.command)),
        agent_adapt::HookType::Prompt => Some(("prompt", &mut hook.prompt)),
        _ => None,
    };
    if let Some((key, slot)) = payload {
        match (body.is_empty(), slot.is_some()) {
            (false, true) => {
                return Err(CoreError::refused(
                    "hook-payload-twice",
                    format!(
                        "hook `{name}` carries a body and a `{key}` key; both are the \
                         {key} this hook runs, so one of them would be lost. Keep the body, \
                         or keep the key"
                    ),
                ));
            }
            (false, false) => *slot = Some(body.to_owned()),
            (true, _) => {}
        }
    }

    let missing = match r#type {
        agent_adapt::HookType::Command => hook.command.is_none().then_some("command"),
        agent_adapt::HookType::Http => hook.url.is_none().then_some("url"),
        agent_adapt::HookType::Prompt => hook.prompt.is_none().then_some("prompt"),
        agent_adapt::HookType::McpTool | agent_adapt::HookType::Agent => None,
    };
    if let Some(key) = missing {
        // Only Command and Prompt read the body; an Http hook's `url` never
        // comes from it, so that remediation drops the "write it in the body" clause.
        let remediation = match r#type {
            agent_adapt::HookType::Http => format!(
                "hook `{name}` is a `{}` hook with no `{key}`: write it as a `{key}` key",
                r#type.as_str()
            ),
            _ => format!(
                "hook `{name}` is a `{}` hook with no `{key}`: write it in the body, or as a \
                 `{key}` key",
                r#type.as_str()
            ),
        };
        return Err(CoreError::refused("hook-missing-payload", remediation));
    }

    Ok(hook)
}

/// One hook key as a string, refusing any other shape.
fn hook_string(
    keys: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    name: &str,
) -> Result<Option<String>, CoreError> {
    match keys.get(key) {
        None => Ok(None),
        Some(serde_json::Value::String(value)) => {
            Ok(Some(value.clone()).filter(|v| !v.trim().is_empty()))
        }
        Some(other) => Err(CoreError::refused(
            "malformed-hook",
            format!(
                "hook `{name}`: `{key}` must be a string, not {}",
                hook_type_name(other)
            ),
        )),
    }
}

/// One hook key as a boolean. `true`/`false` only — a string `"true"` is a
/// value the harness would read as truthy whatever it says, so refusing it
/// here is the only place the author finds out.
fn hook_bool(
    keys: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    name: &str,
) -> Result<Option<bool>, CoreError> {
    match keys.get(key) {
        None => Ok(None),
        Some(serde_json::Value::Bool(value)) => Ok(Some(*value)),
        Some(other) => Err(CoreError::refused(
            "malformed-hook",
            format!(
                "hook `{name}`: `{key}` must be true or false, not {}",
                hook_type_name(other)
            ),
        )),
    }
}

/// One hook key as a whole number of milliseconds.
fn hook_int(
    keys: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    name: &str,
) -> Result<Option<i64>, CoreError> {
    match keys.get(key) {
        None => Ok(None),
        Some(serde_json::Value::Number(value)) if value.is_i64() => Ok(value.as_i64()),
        Some(other) => Err(CoreError::refused(
            "malformed-hook",
            format!(
                "hook `{name}`: `{key}` must be a whole number of milliseconds, not {}",
                hook_type_name(other)
            ),
        )),
    }
}

fn hook_type_name(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::Null => "nothing",
        serde_json::Value::Bool(_) => "a boolean",
        serde_json::Value::Number(_) => "a number",
        serde_json::Value::String(_) => "a string",
        serde_json::Value::Array(_) => "a list",
        serde_json::Value::Object(_) => "a mapping",
    }
}

/// The note's projectable half as a command.
///
/// The body becomes the prompt, and `argument-hint` finally means something:
/// a skill carries the key and no renderer of a skill emits it, because a
/// skill is chosen by the model rather than typed by a person. A command is
/// typed, so the hint is what the harness shows while it is being typed.
///
/// # Errors
///
/// [`CoreError::Refused`] · `unsafe-path` when the name cannot become a safe
/// file stem — the same hazard [`to_adapt_agent`] closes, and for the same
/// reason: the renderer joins a slug into a filename without slugifying it.
fn to_adapt_command(
    snapshot: &SkillProjection,
    _ns: &Namespace,
    overrides_target: Option<&str>,
) -> Result<agent_adapt::Command, CoreError> {
    let content = &snapshot.content;
    let slug = agent_adapt::naming::slugify_skill_name(&content.name).map_err(|e| {
        CoreError::refused(
            "unsafe-path",
            format!("`{}` cannot become a command file name: {e}", content.name),
        )
    })?;
    let mut command = agent_adapt::Command::new(content.name.clone(), slug);
    command.description = Some(content.description.clone());
    command.argument_hint = content.argument_hint.clone();
    command.argument_names = content.argument_names.clone();
    command.arguments = content.arguments.clone();
    command.tools = content.allowed_tools.clone();
    command.model = content.model_override.clone();
    command.body = content.body.clone();
    command.overrides = overrides_target
        .and_then(|dest| content.overrides.get(dest))
        .cloned()
        .unwrap_or_default();
    Ok(command)
}

/// The note's projectable half as an agent persona.
///
/// The body becomes the system prompt: an agent note's prose *is* what the
/// harness loads as its instructions. `allowed-tools` and `model` already mean
/// for an agent what they mean for a skill, so they carry across unchanged.
///
/// The slug is slugified here, and it has to be:
/// [`agent_adapt::runtimes::standard::render_agent`] joins it into a filename
/// **without** slugifying, so an unslugged name carries a traversal hazard
/// this side is responsible for closing.
///
/// # Errors
///
/// [`CoreError::Refused`] · `unsafe-path` when the name cannot become a safe
/// file stem — refused before any path is joined, naming the value.
fn to_adapt_agent(
    snapshot: &SkillProjection,
    _ns: &Namespace,
) -> Result<agent_adapt::Agent, CoreError> {
    let content = &snapshot.content;
    let slug = agent_adapt::naming::slugify_skill_name(&content.name).map_err(|e| {
        CoreError::refused(
            "unsafe-path",
            format!("`{}` cannot become an agent file name: {e}", content.name),
        )
    })?;
    Ok(agent_adapt::Agent {
        name: content.name.clone(),
        slug,
        description: Some(content.description.clone()),
        model: content.model_override.clone(),
        system_prompt: Some(content.body.clone()),
        // Not modelled on a vault note. An agent note that wants one carries
        // it as an ordinary foreign key, and inventing a default here would
        // publish a sampling temperature nobody chose.
        temperature: None,
        tools: content.allowed_tools.clone(),
        tags: content.tags.clone(),
        category: None,
        is_template: false,
    })
}

fn to_adapt_skill(
    snapshot: &SkillProjection,
    ns: &Namespace,
    overrides_target: Option<&str>,
) -> agent_adapt::Skill {
    let content = &snapshot.content;
    let mut skill = agent_adapt::Skill::new(
        content.name.clone(),
        content.description.clone(),
        content.body.clone(),
    );
    skill.argument_hint = content.argument_hint.clone();
    skill.argument_names = content.argument_names.clone();
    skill.arguments = content.arguments.clone();
    skill.allowed_tools = content.allowed_tools.clone();
    skill.license = content.license.clone();
    skill.compatibility = content.compatibility.clone();
    skill.metadata = content.metadata.clone();
    skill.model_override = content.model_override.clone();
    skill.context_mode = content.context_mode.clone();
    skill.user_invocable = content.user_invocable;
    skill.disable_model_invocation = content.disable_model_invocation;
    skill.tags = content.tags.clone();
    // Our namespace never travels — see the module doc. Wholesale by
    // prefix, with no allow-list of known keys to keep in step, which is
    // the point of having a prefix at all.
    skill.annotations = content
        .annotations
        .iter()
        .filter(|(key, _)| !ns.is_ours(key))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    skill.resources = snapshot
        .resources
        .iter()
        .map(
            |(relative_path, content, executable)| agent_adapt::SkillResource {
                relative_path: relative_path.clone(),
                content: content.clone(),
                executable: *executable,
            },
        )
        .collect();
    // An invariant, not an oversight: nothing an override says for one destination is visible to the render of another.
    skill.overrides = overrides_target
        .and_then(|dest| content.overrides.get(dest))
        .cloned()
        .unwrap_or_default();
    skill
}

fn forward_slashed(path: &std::path::Path) -> String {
    path.components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::SkillContent;

    /// The default namespace — the strip every test below emits under, except
    /// the one that configures a different one.
    fn sw() -> Namespace {
        Namespace::default()
    }

    fn content(name: &str) -> SkillContent {
        SkillContent {
            name: name.to_owned(),
            description: "does a thing".into(),
            argument_hint: None,
            argument_names: None,
            arguments: Vec::new(),
            body: format!("# {name}\n\nInstructions.\n"),
            allowed_tools: vec!["Read".into()],
            license: None,
            compatibility: None,
            metadata: Default::default(),
            model_override: None,
            context_mode: None,
            user_invocable: true,
            disable_model_invocation: false,
            tags: vec![],
            annotations: serde_json::Map::new(),
            overrides: Default::default(),
        }
    }

    fn snapshot(name: &str, resources: Vec<(String, Vec<u8>, bool)>) -> SkillProjection {
        SkillProjection {
            content: content(name),
            resources,
        }
    }

    /// A hook note as the vault holds one: the harness's own keys among the
    /// annotations, and a body that is the script.
    fn hook_snapshot(name: &str, keys: serde_json::Value, body: &str) -> SkillProjection {
        let mut content = content(name);
        content.annotations = keys.as_object().unwrap().clone();
        content.body = body.to_owned();
        content.allowed_tools = Vec::new();
        SkillProjection {
            content,
            resources: Vec::new(),
        }
    }

    #[test]
    fn a_hook_notes_frontmatter_and_body_become_a_hook() {
        let snap = hook_snapshot(
            "lint-on-write",
            serde_json::json!({
                "event": "PreToolUse",
                "matcher": "Edit|Write",
                "timeout": 5000,
                "if": "$CI",
                "async": true,
                "once": false,
            }),
            "just lint\n",
        );
        let hook = to_adapt_hook(&snap, None).unwrap();
        assert_eq!(hook.event, "PreToolUse");
        assert_eq!(hook.matcher.as_deref(), Some("Edit|Write"));
        assert_eq!(hook.command.as_deref(), Some("just lint"));
        assert_eq!(hook.timeout_ms, 5000);
        assert_eq!(hook.r#if.as_deref(), Some("$CI"));
        assert_eq!(hook.r#async, Some(true));
        assert_eq!(hook.once, Some(false));
        assert_eq!(hook.r#type, Some(agent_adapt::HookType::Command));
    }

    #[test]
    fn a_prompt_hook_takes_its_prompt_from_the_body() {
        let snap = hook_snapshot(
            "summarise",
            serde_json::json!({"event": "Stop", "type": "prompt"}),
            "Summarise what changed.\n",
        );
        let hook = to_adapt_hook(&snap, None).unwrap();
        assert_eq!(hook.prompt.as_deref(), Some("Summarise what changed."));
        assert!(hook.command.is_none());
    }

    /// AC-7's vault-side door: an unknown `type` spelling is refused, not
    /// written through into a harness config nobody reads back.
    #[test]
    fn an_unknown_hook_type_is_refused_by_name() {
        let snap = hook_snapshot(
            "odd",
            serde_json::json!({"event": "Stop", "type": "shell"}),
            "just go\n",
        );
        let err = to_adapt_hook(&snap, None).unwrap_err().to_string();
        assert!(err.contains("unknown-hook-type"), "{err}");
        assert!(err.contains("shell"), "{err}");
    }

    #[test]
    fn a_hook_with_no_event_is_refused_rather_than_defaulted() {
        let snap = hook_snapshot("nowhere", serde_json::json!({}), "just go\n");
        let err = to_adapt_hook(&snap, None).unwrap_err().to_string();
        assert!(err.contains("hook-missing-event"), "{err}");
    }

    #[test]
    fn a_hook_with_nothing_to_run_is_refused() {
        let snap = hook_snapshot("empty", serde_json::json!({"event": "Stop"}), "");
        let err = to_adapt_hook(&snap, None).unwrap_err().to_string();
        assert!(err.contains("hook-missing-payload"), "{err}");
    }

    #[test]
    fn a_hook_key_of_the_wrong_shape_is_refused_naming_the_key() {
        let snap = hook_snapshot(
            "wrong",
            serde_json::json!({"event": "Stop", "timeout": "soon"}),
            "just go\n",
        );
        let err = to_adapt_hook(&snap, None).unwrap_err().to_string();
        assert!(err.contains("malformed-hook"), "{err}");
        assert!(err.contains("timeout"), "{err}");
    }

    #[test]
    fn a_target_with_no_hooks_layout_refuses_by_name() {
        let hook = agent_adapt::Hook::command("h", "h", "PreToolUse", "echo");
        let err = project_plugin_hooks(&[hook], "github-copilot")
            .unwrap_err()
            .to_string();
        assert!(err.contains("no-renderer"), "{err}");
        assert!(err.contains("github-copilot"), "{err}");
    }

    #[test]
    fn no_hooks_means_no_document() {
        assert!(project_plugin_hooks(&[], "claude-code").unwrap().is_none());
    }

    #[test]
    fn per_target_layouts_match_the_live_corpus() {
        let snap = snapshot("alpha", vec![]);
        let cases = [
            ("claude-code", ".claude/skills/alpha/SKILL.md"),
            ("antigravity", ".agents/skills/alpha/SKILL.md"),
            ("codex-cli", ".agents/skills/alpha/SKILL.md"),
            ("opencode", ".opencode/skills/alpha/SKILL.md"),
            ("amp", ".agents/skills/alpha/SKILL.md"),
        ];
        for (target, expected) in cases {
            let files = project_skill(&snap, &[target.to_owned()], &sw()).unwrap();
            assert_eq!(files.len(), 1, "{target}");
            assert_eq!(files[0].relative_path, expected, "{target}");
        }
    }

    #[test]
    fn resources_land_beside_the_skill_md_with_exec_bits() {
        let snap = snapshot(
            "alpha",
            vec![
                ("run.sh".to_owned(), b"#!/bin/sh\n".to_vec(), true),
                ("helper.ts".to_owned(), b"export {}\n".to_vec(), false),
            ],
        );
        let files = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap();
        let paths: Vec<_> = files.iter().map(|f| f.relative_path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                ".claude/skills/alpha/SKILL.md",
                ".claude/skills/alpha/helper.ts",
                ".claude/skills/alpha/run.sh",
            ]
        );
        let run = files
            .iter()
            .find(|f| f.relative_path.ends_with("run.sh"))
            .unwrap();
        assert!(run.executable);
    }

    #[test]
    fn annotations_are_emitted_before_the_closing_fence_sorted() {
        let mut c = content("alpha");
        c.annotations
            .insert("zeta".into(), serde_json::Value::from(3));
        c.annotations
            .insert("alpha_key".into(), serde_json::Value::from("v"));
        let snap = SkillProjection {
            content: c,
            resources: vec![],
        };
        let files = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap();
        let text = String::from_utf8(files[0].content.clone()).unwrap();

        let close = text.find("\n---\n").expect("closing fence");
        let fm = &text[..close];

        // What is pinned is that an unmodelled key survives into the
        // frontmatter block, with its value, in sorted order. The *spelling*
        // is `agent-adapt`'s to decide and is changing: the standard defines a
        // closed six-key field set and types `metadata` as `dict[str, str]`,
        // so a conformant renderer nests these under `metadata:` and encodes
        // the value as a string. Both forms satisfy the property this test is
        // about, and asserting the dialect instead would make a deliberate
        // conformance fix look like a regression.
        for (key, value) in [("alpha_key", "v"), ("zeta", "3")] {
            assert!(
                fm.contains(&format!("{key}: {value}"))
                    || fm.contains(&format!("{key}: \"{value}\"")),
                "`{key}` did not survive with its value:\n{fm}"
            );
        }
        assert!(
            fm.find("alpha_key").unwrap() < fm.find("zeta").unwrap(),
            "sorted key order"
        );
        // Rendering twice with the same input is byte-stable.
        let again = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap();
        assert_eq!(files[0].content, again[0].content);
    }

    #[test]
    fn our_namespace_is_stripped_at_emit_whatever_route_it_arrived_by() {
        // The second layer of the strip. `read_vault_skill` never puts an
        // `sw-` key in `annotations`, but `SkillContent` is public and a
        // caller can build one from anywhere — so the emit seam checks too.
        let mut c = content("alpha");
        for key in [
            "sw-kind",
            "sw-targets",
            "sw-source-hash",
            "sw-invented-last-week",
            "sw",
        ] {
            c.annotations
                .insert(key.into(), serde_json::Value::from("ours"));
        }
        c.annotations
            .insert("apex".into(), serde_json::Value::from("theirs"));
        let snap = SkillProjection {
            content: c,
            resources: vec![],
        };

        let files = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap();
        let text = String::from_utf8(files[0].content.clone()).unwrap();

        assert!(!text.contains("ours"), "{text}");
        // A near-miss outside the namespace is still the user's key.
        assert!(text.contains("apex: theirs"), "{text}");
    }

    #[test]
    fn the_strip_follows_the_configured_namespace_in_both_directions() {
        // A vault that configured `x`: its own keys go, and `sw-` is a key
        // some other tool owns — carried, exactly like `apex` is under the
        // default. Both halves matter. Stripping `sw-` here would delete a
        // key this vault never claimed; keeping `x-` would publish the
        // author's configuration into somebody else's skill directory.
        let mut c = content("alpha");
        for key in ["x-kind", "x-source-hash", "x-invented-last-week", "x"] {
            c.annotations
                .insert(key.into(), serde_json::Value::from("ours"));
        }
        c.annotations
            .insert("sw-kind".into(), serde_json::Value::from("theirs"));
        let snap = SkillProjection {
            content: c,
            resources: vec![],
        };

        let files = project_skill(
            &snap,
            &["claude-code".to_owned()],
            &Namespace::new("x").unwrap(),
        )
        .unwrap();
        let text = String::from_utf8(files[0].content.clone()).unwrap();

        assert!(!text.contains("ours"), "{text}");
        assert!(text.contains("sw-kind"), "{text}");
        assert!(text.contains("theirs"), "{text}");
    }

    #[test]
    fn a_resource_path_that_escapes_is_refused_under_the_unsafe_path_token() {
        // The renderer catches these, and what matters here is the variant they
        // arrive as: `Refused`, which a host logs as denied, rather than
        // `Projection`, which it logs as a generic error.
        for escape in [
            "../../../../etc/evil.sh",
            "/absolute/evil.md",
            "a/../b.md",
            "./evil.md",
            "a//b.md",
            "C:\\Windows\\evil.md",
        ] {
            let snap = snapshot("alpha", vec![(escape.to_owned(), b"x".to_vec(), true)]);
            let err = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap_err();
            let message = err.to_string();

            assert!(matches!(err, CoreError::Refused(_)), "{escape}: {message}");
            assert!(
                message.starts_with("refused: unsafe-path: "),
                "{escape}: {message}"
            );
            // The path, verbatim, so the note that carries it can be found.
            assert!(message.contains(escape), "{escape}: {message}");
            assert!(message.contains("claude-code"), "{escape}: {message}");
        }
    }

    #[test]
    fn every_other_render_failure_is_still_a_projection_error() {
        // A name with no legal slug is refused by the renderer too, and it is
        // not a path escape — so the new mapping must not swallow it.
        let snap = snapshot("!!!", vec![]);
        let err = project_skill(&snap, &["claude-code".to_owned()], &sw()).unwrap_err();
        assert!(matches!(err, CoreError::Projection(_)), "{err}");
    }

    #[test]
    fn unknown_target_is_refused_not_skipped() {
        let snap = snapshot("alpha", vec![]);
        let err = project_skill(&snap, &["windsurf".to_owned()], &sw()).unwrap_err();
        assert!(matches!(err, CoreError::Projection(_)));
    }

    #[test]
    fn hash_is_order_independent_and_exec_sensitive() {
        let a = ProjectedFile {
            relative_path: "a".into(),
            content: b"1".to_vec(),
            executable: false,
        };
        let b = ProjectedFile {
            relative_path: "b".into(),
            content: b"2".to_vec(),
            executable: false,
        };
        assert_eq!(
            content_hash(&[a.clone(), b.clone()]),
            content_hash(&[b.clone(), a.clone()])
        );
        let mut b_exec = b.clone();
        b_exec.executable = true;
        assert_ne!(
            content_hash(&[a.clone(), b]),
            content_hash(&[a, b_exec]),
            "exec bit must be hash-visible"
        );
    }

    #[test]
    fn multi_target_projection_renders_every_target_once() {
        let snap = snapshot("alpha", vec![("h.ts".to_owned(), b"x".to_vec(), false)]);
        let files = project_skill(
            &snap,
            &["claude-code".to_owned(), "antigravity".to_owned()],
            &sw(),
        )
        .unwrap();
        assert_eq!(files.len(), 4);
        assert!(
            files
                .iter()
                .any(|f| f.relative_path == ".agents/skills/alpha/h.ts")
        );
    }

    // --- Commands, across every runtime that now has a renderer -------------

    #[test]
    fn a_command_projects_into_every_verified_runtimes_layout() {
        let snap = snapshot("ship", vec![]);
        let cases = [
            ("claude-code", ".claude/commands/ship.md"),
            ("codex-cli", ".codex/prompts/ship.md"),
            ("opencode", ".opencode/commands/ship.md"),
            ("github-copilot", ".github/prompts/ship.prompt.md"),
        ];
        for (target, expected) in cases {
            let files = project_command(&snap, &[target.to_owned()], &sw(), None).unwrap();
            assert_eq!(files.len(), 1, "{target}");
            assert_eq!(files[0].relative_path, expected, "{target}");
        }
    }

    #[test]
    fn a_command_has_no_renderer_for_amp_or_antigravity() {
        let snap = snapshot("ship", vec![]);
        for target in ["amp", "antigravity"] {
            let err = project_command(&snap, &[target.to_owned()], &sw(), None).unwrap_err();
            assert!(matches!(err, CoreError::Refused(_)), "{target}: {err}");
            assert!(err.to_string().contains("no-renderer"), "{target}: {err}");
        }
    }

    #[test]
    fn github_copilot_renders_no_skills_or_agents_yet() {
        let snap = snapshot("ship", vec![]);
        let skill_err = project_skill(&snap, &["github-copilot".to_owned()], &sw()).unwrap_err();
        assert!(matches!(skill_err, CoreError::Projection(_)), "{skill_err}");
        let agent_err = project_agent(&snap, &["github-copilot".to_owned()], &sw()).unwrap_err();
        assert!(matches!(agent_err, CoreError::Refused(_)), "{agent_err}");
    }
}
