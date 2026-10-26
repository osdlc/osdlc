//! Standard capability implementations shared by the built-in runtimes.
//!
//! Every Claude-Code-style runtime (all of the ones we ship except
//! `npm_package` and `portable`, which render fewer asset types) has the
//! same rendering logic — the only per-runtime variations are:
//!
//! * where files land (captured in [`crate::RuntimePaths`]),
//! * the frontmatter dialect (captured in [`crate::FrontmatterDialect`]),
//! * the MCP config format (handled per-runtime by calling a specific
//!   [`crate::mcp::render`] function).
//!
//! These helpers use a runtime's `paths()` and `frontmatter_dialect()`
//! to do the common work.
//!
//! [`render_command`] follows the same pattern one layer down: every
//! runtime whose command format is Markdown with a frontmatter block
//! (Claude Code, Codex CLI, OpenCode, GitHub Copilot) calls it with its own
//! [`crate::render::CommandFields`] (which optional keys its format
//! accepts) and filename suffix. `command_path` resolves where the one
//! file lands.

use std::path::PathBuf;
use std::sync::OnceLock;

use crate::paths::join_within;
use crate::render::{
    render_agent_md, render_command_md, render_hooks_json, render_script_body, render_skill_md,
    script_filename,
};
use crate::{
    Agent, CodingAgentRuntime, Command, ExportedFile, ExportedFileType, Hook, Result, Scope,
    Script, Skill, ToolRegistry, naming::slugify_skill_name,
};

/// The default tool vocabulary, shared by every built-in runtime.
/// Per-runtime name translation happens via `RuntimeId` at render time
/// (see `crate::tools::ToolRegistry::translate_tool_name`), not by
/// varying this table, so one shared instance is correct for all of them.
pub(crate) fn registry() -> &'static ToolRegistry {
    static REGISTRY: OnceLock<ToolRegistry> = OnceLock::new();
    REGISTRY.get_or_init(ToolRegistry::default)
}

/// Render a skill as `<skills_dir>/<slug>/SKILL.md` plus one file per
/// [`Skill::resources`] entry under the same slug directory.
///
/// The path is taken from the runtime's
/// [`RuntimePaths::skills_dir`](crate::RuntimePaths::skills_dir) for the
/// project scope — that's the canonical install location. The `SKILL.md`
/// is always first; resources follow in declaration order.
///
/// # Errors
///
/// [`Error::Validation`](crate::Error::Validation) if [`Skill::name`] has
/// no legal slug — see [`slugify_skill_name`]. That name never reaches a
/// path join: an empty slug joined onto `skills_dir` yields the skills
/// directory itself, so the skill would collapse to
/// `<skills_dir>/SKILL.md` and any *other* such skill would overwrite it.
///
/// [`Error::UnsafePath`](crate::Error::UnsafePath) if the slug directory
/// or any
/// [`SkillResource::relative_path`](crate::SkillResource::relative_path)
/// would not land strictly inside its root. Both go through
/// [`join_within`], the crate's single containment rule — see
/// [`crate::paths`]. The whole render is refused: the returned `Vec` is
/// all-or-nothing, so a caller that writes only on `Ok` leaves no partial
/// tree behind.
pub fn render_skill<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    skill: &Skill,
    registry: &ToolRegistry,
) -> Result<Vec<ExportedFile>> {
    let slug = slugify_skill_name(&skill.name)?;
    let content = render_skill_md(skill, runtime.id(), runtime.frontmatter_dialect(), registry)?;
    let skills_dir = runtime.paths().skills_dir.for_scope(Scope::Project);
    // `slugify_skill_name` already refused an empty slug, so this join
    // cannot silently collapse onto `skills_dir`. It goes through
    // `join_within` anyway: every root-plus-caller-string join does.
    let slug_dir: PathBuf = join_within(skills_dir, &slug)?;
    let mut files = vec![ExportedFile {
        path: slug_dir.join("SKILL.md"),
        content: content.into_bytes(),
        kind: ExportedFileType::Skill,
        executable: false,
    }];
    for resource in &skill.resources {
        files.push(ExportedFile {
            // `relative_path` is caller-supplied. A bare `join` lets `..`
            // walk out of the slug dir and lets an absolute path replace
            // it wholesale — and peer resources keep their executable
            // bit, so the escaping file lands executable.
            path: join_within(&slug_dir, &resource.relative_path)?,
            content: resource.content.clone(),
            kind: ExportedFileType::Resource,
            executable: resource.executable,
        });
    }
    Ok(files)
}

/// Render an agent as a single `<slug>.md` file under the runtime's
/// `agents_dir`.
///
/// # Errors
///
/// [`Error::UnsafePath`](crate::Error::UnsafePath) if [`Agent::slug`] is
/// not a safe relative path. Unlike a skill name, an agent slug is *not*
/// slugified before it becomes a filename, so it carries the same
/// traversal hazard as a peer-resource path.
pub fn render_agent<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    agent: &Agent,
    registry: &ToolRegistry,
) -> Result<Vec<ExportedFile>> {
    let content = render_agent_md(agent, runtime.id(), runtime.frontmatter_dialect(), registry);
    let agents_dir = runtime.paths().agents_dir.for_scope(Scope::Project);
    let path = join_within(agents_dir, format!("{}.md", agent.slug))?;
    Ok(vec![ExportedFile {
        path,
        content: content.into_bytes(),
        kind: ExportedFileType::Agent,
        executable: false,
    }])
}

/// The one file a command renders to, under the runtime's `commands_dir`,
/// named `<slug><suffix>` — `suffix` carries its own leading dot so a
/// runtime whose format wants a compound extension (GitHub Copilot's
/// `.prompt.md`) needs no second join.
///
/// `None` when the runtime has no commands directory — the same signal
/// [`render_command`] turns into an empty
/// `Vec`, the no-op shape [`render_hooks`] uses for a runtime with no hooks
/// file.
///
/// # Errors
///
/// [`Error::UnsafePath`](crate::Error::UnsafePath) if [`Command::slug`] is not
/// a safe relative path — the same hazard as [`render_agent`], since a slug
/// becomes a filename without being slugified first.
fn command_path<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    command: &Command,
    suffix: &str,
) -> Result<Option<PathBuf>> {
    let Some(commands_dir) = runtime.paths().commands_dir.as_ref() else {
        return Ok(None);
    };
    Ok(Some(join_within(
        commands_dir.for_scope(Scope::Project),
        format!("{}{suffix}", command.slug),
    )?))
}

/// Render a command in the Markdown-with-frontmatter shape
/// ([`render_command_md`]) as a single `<slug><suffix>` file under the
/// runtime's `commands_dir`.
///
/// `fields` is the runtime's own [`crate::render::CommandFields`] — which
/// optional keys its command format accepts — and `suffix` its filename
/// extension (`.md` for most, `.prompt.md` for GitHub Copilot). Every
/// runtime this crate renders commands for (Claude Code, Codex CLI,
/// OpenCode, GitHub Copilot) calls this one function.
pub fn render_command<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    command: &Command,
    fields: &crate::render::CommandFields,
    suffix: &str,
    registry: &ToolRegistry,
) -> Result<Vec<ExportedFile>> {
    let Some(path) = command_path(runtime, command, suffix)? else {
        return Ok(Vec::new());
    };
    let content = render_command_md(command, runtime.id(), fields, registry);
    Ok(vec![ExportedFile {
        path,
        content: content.into_bytes(),
        kind: ExportedFileType::Command,
        executable: false,
    }])
}

/// Render a collection of hooks as a single file at the runtime's
/// `hooks_file` path, in the nested `hooks.json` shape.
///
/// Returns an empty `Vec` if the runtime has no hooks file or the input
/// slice is empty — either case is a no-op, not an error.
pub fn render_hooks<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    hooks: &[Hook],
    registry: &ToolRegistry,
) -> Result<Vec<ExportedFile>> {
    if hooks.is_empty() || runtime.paths().hooks_file.is_none() {
        return Ok(Vec::new());
    }
    let content = render_hooks_json(hooks, runtime.id(), registry)?;
    Ok(wrap_hooks_file(runtime, content))
}

/// One rendered hooks document at the runtime's `hooks_file` path, or nothing
/// when the runtime has none.
pub fn wrap_hooks_file<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    content: String,
) -> Vec<ExportedFile> {
    let Some(hooks_file) = runtime.paths().hooks_file.as_ref() else {
        return Vec::new();
    };
    vec![ExportedFile {
        path: hooks_file.for_scope(Scope::Project).clone(),
        content: content.into_bytes(),
        kind: ExportedFileType::Hook,
        executable: false,
    }]
}

/// Render a single script file (shebang + body) under the runtime's
/// `scripts_dir`.
///
/// # Errors
///
/// [`Error::UnsafePath`](crate::Error::UnsafePath) if [`Script::slug`]
/// is not a safe relative path — same hazard as [`render_agent`].
pub fn render_script<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    script: &Script,
) -> Result<ExportedFile> {
    let content = render_script_body(script);
    let scripts_dir = runtime.paths().scripts_dir.for_scope(Scope::Project);
    let path = join_within(scripts_dir, script_filename(script))?;
    Ok(ExportedFile {
        path,
        content: content.into_bytes(),
        kind: ExportedFileType::Script,
        executable: true,
    })
}

/// Wrap a pre-rendered MCP config string in an [`ExportedFile`] at the
/// runtime's `mcp_config_file` path.
///
/// Each runtime calls the format-specific renderer (`render_claude_json`,
/// `render_codex_toml`, `render_antigravity_json`) and passes the result here.
/// Returns an empty `Vec` if the runtime declares no MCP config path.
pub fn wrap_mcp_config<R: CodingAgentRuntime + ?Sized>(
    runtime: &R,
    config_content: String,
) -> Vec<ExportedFile> {
    let Some(mcp_file) = runtime.paths().mcp_config_file.as_ref() else {
        return Vec::new();
    };
    vec![ExportedFile {
        path: mcp_file.for_scope(Scope::Project).clone(),
        content: config_content.into_bytes(),
        kind: ExportedFileType::Config,
        executable: false,
    }]
}
