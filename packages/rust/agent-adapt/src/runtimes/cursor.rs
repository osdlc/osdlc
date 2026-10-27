//! Cursor runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.cursor/
//! ├── hooks.json
//! └── skills/<slug>/
//!     ├── SKILL.md
//!     ├── scripts/…
//!     ├── references/…
//!     └── assets/…
//! ```
//!
//! Skills and hooks. Cursor documents `rules/`, `agents/`, `commands/` and
//! `mcp.json` as well, and this crate renders none of them for Cursor yet — a
//! renderer at a guessed path is worse than no renderer, so the other peer
//! capability traits are unimplemented and [`crate::runtimes::mcp_renderer_for`]
//! and friends answer `None`. `.cursor/rules/*.mdc` in particular is a
//! *different surface* from a skill, not a second spelling of one.
//!
//! Hooks render in Cursor's own `{ "version": 1, "hooks": {…} }` shape (see
//! [`crate::render::render_cursor_hooks_json`]). A Cursor plugin carries the
//! same file, named by its manifest's `hooks` key
//! (<https://cursor.com/docs/reference/plugins>, read 2026-10-05). That page
//! documents `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` as expanded
//! in a plugin's MCP server fields; it does not say either is set for a hook
//! command.
//!
//! # Publishing here is optional
//!
//! Cursor also loads skills from `.agents/skills/`, `.claude/skills/` and
//! `.codex/skills/`
//! (<https://cursor.com/docs/skills> retrieved 2026-09-20: "For compatibility,
//! Cursor also loads skills from Claude and Codex directories"), so a note collection
//! already publishing to [`RuntimeId::Portable`], [`RuntimeId::ClaudeCode`] or
//! [`RuntimeId::CodexCli`] is served without this target. What this target
//! adds is Cursor's own frontmatter dialect and its own tool vocabulary in
//! one tree Cursor owns.
//!
//! # Frontmatter
//!
//! Kebab-case, and the omit list is Cursor's own reading rather than a
//! neighbour's. Cursor documents seven keys — `name`, `description`, `paths`,
//! `disable-model-invocation`, `icon`, `color`, `metadata`, plus `globs` as a
//! legacy fallback for `paths` (same source, "Frontmatter fields"). So:
//!
//! * `disable-model-invocation` **is kept**, unlike every other non-Claude
//!   dialect in this module. It is in
//!   [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] because Claude Code is where
//!   this crate first read it, but Cursor documents it under that exact
//!   spelling and that exact meaning ("the skill is only included when
//!   explicitly invoked via `/skill-name`").
//! * The other five extension keys — `argument-hint`, `arguments`, `model`,
//!   `context`, `user-invocable` — are omitted. Cursor documents none of
//!   them.
//! * `paths`, `icon` and `color` are Cursor's own keys, outside
//!   [`crate::AGENT_SKILLS_FIELDS`] and unmodelled on [`Skill`], so they can
//!   only arrive as a per-target override.
//! * `allowed-tools` is rendered. Cursor documents no tool list for a skill,
//!   but it is an [`crate::AGENT_SKILLS_FIELDS`] key and no dialect in this
//!   crate omits one of those.
//!
//! # Tool names
//!
//! Cursor's only documented tool vocabulary is the permission-token set in
//! `~/.cursor/cli-config.json` — `Shell(…)`, `Read(…)`, `Write(…)`,
//! `WebFetch(…)`, `Mcp(…)`
//! (<https://cursor.com/docs/cli/reference/permissions> retrieved
//! 2026-09-20). Four of those five are already this crate's canonical
//! spelling, so the registry carries one Cursor entry: `Bash` → `Shell`.
//! Every other tool passes through unchanged — and that is an asserted
//! sameness, not an unexamined one. Cursor documents no name for the
//! remaining canonical tools, so inventing one would be worse than leaving
//! the canonical name, which is also Cursor's own casing convention.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::render::render_cursor_hooks_json;
use crate::runtimes::standard;
use crate::{
    CodingAgentRuntime, ExportedFile, FieldNaming, FrontmatterDialect, Hook, HookCapability,
    Result, RuntimeId, RuntimePaths, ScopedRelative, Skill, SkillCapability,
};

/// [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] minus `disable_model_invocation`,
/// the one of the six Cursor documents in its own words. Spelled out rather
/// than filtered at runtime so the list a reader sees is the list the dialect
/// uses.
const OMITTED_EXTENSION_FIELDS: &[&str] = &[
    "argument_hint",
    "arguments",
    "model",
    "context",
    "user_invocable",
];

/// Cursor runtime adapter.
pub struct Cursor;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".cursor/skills"),
        // Declared for the layout's sake; this adapter implements neither
        // `AgentCapability` nor `ScriptCapability`, so nothing is written
        // into either. A skill's own `scripts/` are peer resources inside
        // its slug directory, not files here.
        agents_dir: ScopedRelative::same(".cursor/agents"),
        commands_dir: None,
        scripts_dir: ScopedRelative::same(".cursor/scripts"),
        hooks_file: Some(ScopedRelative::same(".cursor/hooks.json")),
        // Cursor reads `.cursor/mcp.json`; this crate does not render it, and
        // the `None` is what `hook_and_mcp_renderers_track_the_path_options`
        // holds the missing capability impl against.
        mcp_config_file: None,
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        omit_fields: OMITTED_EXTENSION_FIELDS,
        // Cursor documents no `user-invocable` key at all — it spells the
        // same idea `disable-model-invocation` — so stating a default would
        // emit a key nothing reads.
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for Cursor {
    fn id(&self) -> RuntimeId {
        RuntimeId::Cursor
    }
    fn display_name(&self) -> &'static str {
        "Cursor"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for Cursor {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl HookCapability for Cursor {
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>> {
        if hooks.is_empty() {
            return Ok(Vec::new());
        }
        let (content, _) = render_cursor_hooks_json(hooks, standard::registry())?;
        Ok(standard::wrap_hooks_file(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// The skills page: the directory list, the frontmatter table, and the
/// optional `scripts/`, `references/` and `assets/` peers.
const SKILLS: Evidence = Evidence {
    url: "https://cursor.com/docs/skills",
    observed_on: OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The CLI's permission tokens — Cursor's only documented tool vocabulary,
/// and its whole allow/deny model.
const PERMISSIONS: Evidence = Evidence {
    url: "https://cursor.com/docs/cli/reference/permissions",
    observed_on: OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The hooks page: Cursor's lifecycle event names, its hooks-file shape, and
/// what a `stop` hook's output can do.
const HOOKS: Evidence = Evidence {
    url: "https://cursor.com/docs/hooks",
    observed_on: capabilities::HOOKS_OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The date the skills and permissions pages above were read. Its own
/// constant rather than [`capabilities::OBSERVED`]: this survey is later than
/// that sweep, and a re-read of one should not silently move the other.
const OBSERVED: &str = "2026-09-20";

impl DeclaresCapabilities for Cursor {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::Cursor,
            assets: capabilities::derived_assets(RuntimeId::Cursor),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::Cursor),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(Claim::observed(Support::Translated, HOOKS).with_spelling("followup_message").with_note("a `stop` hook's `followup_message` is submitted as the next user message, up to `loop_limit` times (default 5)")),
            overrides: capabilities::override_keys(
                dialect(),
                [
                    capabilities::harness_key(
                        "paths",
                        "glob patterns scoping the skill to matching files; this crate models no such field, so it can only arrive as an override",
                        SKILLS,
                    ),
                    capabilities::harness_key(
                        "globs",
                        "the legacy spelling of `paths`, still accepted for older skills",
                        SKILLS,
                    ),
                    capabilities::harness_key(
                        "icon",
                        "the badge icon when the skill backs a Custom Mode",
                        SKILLS,
                    ),
                    capabilities::harness_key(
                        "color",
                        "the badge colour when the skill backs a Custom Mode",
                        SKILLS,
                    ),
                ],
            ),
        }
    }
}

/// Cursor's permission model is two lists and no third state: `allow` and
/// `deny`, with deny winning. There is no `ask` token and no default-mode
/// key — an unlisted action prompts, but nothing spells that.
fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            Claim::observed(Support::Translated, PERMISSIONS)
                .with_spelling("permissions.allow[]")
                .with_note("entries like `Shell(git)`, `Read(src/**)`, `WebFetch(*.example.com)`"),
        ),
        (
            "deny",
            Claim::observed(Support::Translated, PERMISSIONS)
                .with_spelling("permissions.deny[]")
                .with_note("the same token shapes; deny takes precedence over allow"),
        ),
        (
            "ask",
            Claim::observed(Support::Ignored, PERMISSIONS)
                .with_note("no ask token: an action matching neither list prompts, unspelled"),
        ),
        (
            "mode",
            Claim::observed(Support::Ignored, PERMISSIONS)
                .with_note("no wildcard or default-mode key; the lists are the whole model"),
        ),
    ]
    .into_iter()
    .map(|(concept, claim)| (concept.to_owned(), claim))
    .collect()
}

/// Every canonical event, answered against Cursor's own list: an event Cursor
/// names is [`Support::Translated`] to its camelCase spelling.
fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            let claim = match *event {
                "UserPromptSubmit" => available("beforeSubmitPrompt"),
                "PreToolUse" => available("preToolUse"),
                "PostToolUse" => available("postToolUse"),
                "PostToolUseFailure" => available("postToolUseFailure"),
                "SubagentStart" => available("subagentStart"),
                "SubagentStop" => available("subagentStop"),
                "PreCompact" => available("preCompact"),
                "Stop" => available("stop"),
                "SessionStart" => local_only("sessionStart"),
                "SessionEnd" => local_only("sessionEnd"),
                _ => Claim::observed(Support::Ignored, HOOKS)
                    .with_note("Cursor documents no hook at this point in the loop"),
            };
            ((*event).to_owned(), claim)
        })
        .collect()
}

/// An event Cursor documents, under its own camelCase name.
fn available(name: &str) -> Claim {
    Claim::observed(Support::Translated, HOOKS)
        .with_spelling(name)
        .with_note("read from `.cursor/hooks.json` or a plugin's hooks file")
}

/// An event on Cursor's "Hooks not available in cloud agents" table: it fires
/// in the editor and the CLI, not in a cloud agent.
fn local_only(name: &str) -> Claim {
    Claim::observed(Support::Translated, HOOKS)
        .with_spelling(name)
        .with_note(
            "read from `.cursor/hooks.json` or a plugin's hooks file; not fired in cloud agents",
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sample_skill() -> Skill {
        let mut s = Skill::new("My Skill", "A test skill", "Do the thing.");
        s.allowed_tools = vec!["Read".into(), "Bash".into()];
        s.argument_hint = Some("<pr-number>".into());
        s.model_override = Some("opus".into());
        s.context_mode = Some("fork".into());
        s.user_invocable = false;
        s.disable_model_invocation = true;
        s
    }

    #[test]
    fn skill_path_under_cursor_skills() {
        let files = Cursor.render_skill(&sample_skill()).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".cursor/skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn peer_resources_land_beside_the_skill_and_keep_their_bits() {
        let mut skill = sample_skill();
        skill.resources = vec![
            crate::SkillResource {
                relative_path: "scripts/deploy.sh".into(),
                content: b"#!/bin/sh\n".to_vec(),
                executable: true,
            },
            crate::SkillResource {
                relative_path: "references/REFERENCE.md".into(),
                content: b"# Reference\n".to_vec(),
                executable: false,
            },
        ];
        let files = Cursor.render_skill(&skill).unwrap();
        let by_path: BTreeMap<PathBuf, &ExportedFile> =
            files.iter().map(|f| (f.path.clone(), f)).collect();
        let script = by_path
            .get(&PathBuf::from(".cursor/skills/my-skill/scripts/deploy.sh"))
            .expect("script rendered beside the skill");
        assert!(script.executable, "the execute bit survives the render");
        assert!(
            by_path.contains_key(&PathBuf::from(
                ".cursor/skills/my-skill/references/REFERENCE.md"
            )),
            "reference rendered beside the skill"
        );
    }

    /// The one dialect difference this adapter is built on: Cursor documents
    /// `disable-model-invocation` and none of the other five extension keys.
    /// The omit list is spelled out, so it cannot follow
    /// [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] on its own: a seventh
    /// extension key added there would be absent from this list and Cursor
    /// would start emitting it silently. Partitioning the set is the
    /// invariant that turns that into a failing test instead.
    #[test]
    fn omit_list_partitions_the_extension_fields() {
        const KEPT: &[&str] = &["disable_model_invocation"];
        let mut covered: Vec<&str> = OMITTED_EXTENSION_FIELDS
            .iter()
            .chain(KEPT.iter())
            .copied()
            .collect();
        covered.sort_unstable();
        let mut all: Vec<&str> = crate::AGENT_SKILLS_EXTENSION_FIELDS.to_vec();
        all.sort_unstable();
        assert_eq!(
            covered, all,
            "every extension key is either omitted or deliberately kept — \
             a new one needs a reading of Cursor's docs, not a default"
        );
    }

    #[test]
    fn frontmatter_keeps_disable_model_invocation_and_drops_the_other_five() {
        let files = Cursor.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        let frontmatter = text.split("---\n").nth(1).expect("frontmatter block");
        for key in ["name:", "description:", "disable-model-invocation"] {
            assert!(frontmatter.contains(key), "{key} kept: {frontmatter}");
        }
        for key in ["argument-hint", "model:", "context:", "user-invocable"] {
            assert!(!frontmatter.contains(key), "{key} dropped: {frontmatter}");
        }
    }

    #[test]
    fn hooks_land_in_cursors_own_file_and_shape() {
        let hook = Hook::command("x", "x", "Stop", "echo");
        let files = Cursor.render_hooks(&[hook]).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".cursor/hooks.json"));
        let text = files[0].text().unwrap();
        assert!(text.contains("\"version\": 1"), "{text}");
        assert!(text.contains("\"stop\""), "{text}");
    }

    #[test]
    fn bash_becomes_shell_and_the_rest_stay_canonical() {
        let files = Cursor.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("allowed-tools: Read Shell"), "{text}");
    }
}
