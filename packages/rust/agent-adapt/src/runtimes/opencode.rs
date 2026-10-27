//! OpenCode (SST) runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.opencode/
//! ├── skills/<slug>/SKILL.md
//! ├── agents/<slug>.md
//! ├── scripts/<slug>.{sh,py,js}
//! ├── hooks.json
//! └── config.json        (MCP config, Claude-Code-compatible shape)
//! ```
//!
//! OpenCode uses kebab-case field naming and lowercase tool names
//! (`read`, `edit`, `task`). Its MCP config format mirrors Claude Code's
//! JSON shape, so we render it with `render_claude_json`.
//!
//! # Frontmatter
//!
//! Omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]. Mirroring Claude Code's
//! MCP shape is a deliberate choice this adapter makes; inheriting Claude
//! Code's non-spec frontmatter keys was not — OpenCode documents none of
//! them, and they are outside [`crate::AGENT_SKILLS_FIELDS`].
//!
//! # Commands
//!
//! Markdown with a frontmatter block, the same shape as a skill's, at
//! `.opencode/commands/<slug>.md` (project scope; global scope is
//! `~/.config/opencode/commands/`, a different subtree from the skill
//! layout above, per
//! <https://opencode.ai/docs/commands/> retrieved 2026-09-06: "Global:
//! `~/.config/opencode/commands/`", "Per-project: `.opencode/commands/`" —
//! renders are laid out at [`crate::Scope::Project`], and commands have no
//! install helper that moves them to user scope, so that asymmetry does not
//! surface yet).
//! Frontmatter fields are `description`, `agent`, `model`, `subtask` (same
//! source, "Options"); this crate models `description` and `model` on
//! [`crate::Command`] and has no field for `agent` or `subtask`, so neither
//! is written. No `argument-hint`, no tool list, and no `name` key are
//! documented — the filename is the name ("The markdown file name becomes
//! the command name"). Body placeholders: `$ARGUMENTS` for the full tail,
//! `$1`/`$2`/`$3`… positional (1-based — "`$1` - First argument"); no named
//! `$KEY` form is documented, unlike Codex's.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, AssetKind, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::mcp::{McpCapability, McpServer, render::render_claude_json};
use crate::render::CommandFields;
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, Agent, AgentCapability, CodingAgentRuntime, Command,
    CommandCapability, ExportedFile, FieldNaming, FrontmatterDialect, Hook, HookCapability, Result,
    RuntimeId, RuntimePaths, ScopedRelative, Script, ScriptCapability, Skill, SkillCapability,
};

/// OpenCode's own documented fields for a command: `description` and
/// `model` — see the module doc's "Commands" section.
const COMMAND_FIELDS: CommandFields = CommandFields {
    field_naming: FieldNaming::Kebab,
    name: false,
    argument_hint: false,
    argument_names: false,
    model: true,
    tools_key: None,
};

/// OpenCode runtime adapter.
pub struct OpenCode;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".opencode/skills"),
        agents_dir: ScopedRelative::same(".opencode/agents"),
        commands_dir: Some(ScopedRelative::same(".opencode/commands")),
        scripts_dir: ScopedRelative::same(".opencode/scripts"),
        hooks_file: Some(ScopedRelative::same(".opencode/hooks.json")),
        mcp_config_file: Some(ScopedRelative::same(".opencode/config.json")),
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        omit_fields: AGENT_SKILLS_EXTENSION_FIELDS,
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for OpenCode {
    fn id(&self) -> RuntimeId {
        RuntimeId::OpenCode
    }
    fn display_name(&self) -> &'static str {
        "OpenCode"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for OpenCode {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl AgentCapability for OpenCode {
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>> {
        standard::render_agent(self, agent, standard::registry())
    }
}

impl CommandCapability for OpenCode {
    fn render_command(&self, command: &Command) -> Result<Vec<ExportedFile>> {
        standard::render_command(self, command, &COMMAND_FIELDS, ".md", standard::registry())
    }
}

impl HookCapability for OpenCode {
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>> {
        standard::render_hooks(self, hooks, standard::registry())
    }
}

impl ScriptCapability for OpenCode {
    fn render_script(&self, script: &Script) -> Result<ExportedFile> {
        standard::render_script(self, script)
    }
}

impl McpCapability for OpenCode {
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>> {
        let content = render_claude_json(server)?;
        Ok(standard::wrap_mcp_config(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// OpenCode's plugin documentation, which is where its hooks live — there is
/// no hooks file to read.
const PLUGINS: Evidence = Evidence {
    url: "https://opencode.ai/docs/plugins/",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The `permission` block, the one declarative per-tool surface across harnesses
/// besides Claude Code's.
const PERMISSIONS: Evidence = Evidence {
    url: "https://opencode.ai/docs/permissions/",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for OpenCode {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::OpenCode,
            assets: assets(),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::OpenCode),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, PLUGINS).with_note(
                    "hooks are plugin code, and this crate renders no hooks OpenCode reads",
                ),
            ),
            overrides: capabilities::override_keys(
                dialect(),
                [capabilities::harness_key(
                    "permission",
                    "the per-tool allow/ask/deny block; this crate models no permission vocabulary, so it can only arrive as an override",
                    PERMISSIONS,
                )],
            ),
        }
    }
}

/// The derived asset claims plus the caveat the derivation cannot know: this
/// crate renders a hooks file OpenCode does not read.
fn assets() -> BTreeMap<AssetKind, Claim> {
    let mut assets = capabilities::derived_assets(RuntimeId::OpenCode);
    let hook = assets
        .get_mut(&AssetKind::Hook)
        .expect("derived_assets answers every asset kind");
    hook.note = Some(
        "this crate writes `.opencode/hooks.json`; OpenCode takes hooks as plugin functions and documents no such file",
    );
    hook.evidence = Some(PLUGINS);
    assets
}

fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            "permission.<tool> = \"allow\"",
            "per-tool entries in the `permission` block, with `*` for the default",
        ),
        (
            "deny",
            "permission.<tool> = \"deny\"",
            "per-tool entries in the `permission` block",
        ),
        (
            "ask",
            "permission.<tool> = \"ask\"",
            "per-tool entries in the `permission` block",
        ),
        (
            "mode",
            "permission.\"*\"",
            "the wildcard entry is the default every unlisted tool falls to",
        ),
    ]
    .into_iter()
    .map(|(concept, spelling, note)| {
        (
            concept.to_owned(),
            Claim::observed(Support::Translated, PERMISSIONS)
                .with_spelling(spelling)
                .with_note(note),
        )
    })
    .collect()
}

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            let claim = match *event {
                "PreToolUse" => plugin_event("tool.execute.before"),
                "PostToolUse" => plugin_event("tool.execute.after"),
                "Stop" => plugin_event("session.idle"),
                "SessionStart" => plugin_event("session.created"),
                _ => Claim::observed(Support::Ignored, PLUGINS).with_note(
                    "hooks are plugin functions and none is documented for this point in the loop; the `hooks.json` this crate writes is not read",
                ),
            };
            ((*event).to_owned(), claim)
        })
        .collect()
}

fn plugin_event(name: &str) -> Claim {
    Claim::observed(Support::Ignored, PLUGINS)
        .with_spelling(name)
        .with_note(
            "a plugin function, registered in `.ts`/`.js` code; the `hooks.json` this crate writes is not read",
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skill_path_under_opencode_skills() {
        let s = Skill::new("My Skill", "d", "b");
        let files = OpenCode.render_skill(&s).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".opencode/skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn tool_names_translated_to_opencode_vocabulary() {
        let mut s = Skill::new("x", "d", "b");
        s.allowed_tools = vec!["Read".into(), "Edit".into()];
        let files = OpenCode.render_skill(&s).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("allowed-tools: read edit"));
    }

    fn sample_command() -> Command {
        let mut c = Command::new("Ship it", "ship");
        c.description = Some("Cuts a release.".to_owned());
        c.argument_hint = Some("<version>".to_owned());
        c.model = Some("anthropic/claude-3-5-sonnet-20241022".to_owned());
        c.tools = vec!["Read".to_owned()];
        c.body = "Cut the release for $ARGUMENTS.".to_owned();
        c
    }

    #[test]
    fn command_path_is_dot_opencode_commands() {
        let files = OpenCode.render_command(&sample_command()).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".opencode/commands/ship.md"));
    }

    #[test]
    fn command_frontmatter_keeps_description_and_model_but_omits_the_rest() {
        let files = OpenCode.render_command(&sample_command()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("description: Cuts a release."), "{text}");
        assert!(
            text.contains("model: anthropic/claude-3-5-sonnet-20241022"),
            "{text}"
        );
        // OpenCode's own docs name no `name`, `argument-hint`, or tool-list
        // key for a command.
        for absent in ["name:", "argument-hint", "allowed-tools", "arguments:"] {
            assert!(!text.contains(absent), "{absent} leaked: {text}");
        }
    }

    #[test]
    fn command_arguments_section_names_one_based_positional_refs_only() {
        let mut command = sample_command();
        command.arguments = vec![crate::Argument::required("pr-number", "desc")];
        let files = OpenCode.render_command(&command).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("$ARGUMENTS"), "{text}");
        assert!(text.contains("`$1`"), "{text}");
        // No named-variable form, unlike Codex CLI's.
        assert!(!text.contains("PR_NUMBER"), "{text}");
    }
}
