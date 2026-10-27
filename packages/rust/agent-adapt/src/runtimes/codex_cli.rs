//! OpenAI Codex CLI runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/
//! ├── .agents/                   (shared Agent Skills convention)
//! │   ├── skills/<slug>/SKILL.md
//! │   ├── agents/<slug>.md
//! │   └── scripts/<slug>.{sh,py,js}
//! └── .codex/
//!     ├── hooks.json
//!     ├── config.toml             (MCP config)
//!     └── prompts/<slug>.md       (custom prompts — see below)
//! ```
//!
//! Codex CLI splits its asset layout: skills live under `.agents/`
//! following the shared Anthropic Agent Skills convention, while MCP
//! servers and hooks are in the Codex-specific `.codex/` directory.
//! The MCP config is TOML, not JSON. An enabled plugin also carries hooks:
//! Codex loads `hooks/hooks.json` from the plugin root by default, and
//! `.codex-plugin/plugin.json` can name another path
//! (<https://developers.openai.com/codex/hooks>,
//! <https://developers.openai.com/codex/plugins/build>, read 2026-10-05).
//! A plugin hook runs in the session's working directory with the plugin's
//! root in `PLUGIN_ROOT`, and in `CLAUDE_PLUGIN_ROOT` too for compatibility
//! (<https://learn.chatgpt.com/docs/hooks>, read 2026-10-05).
//!
//! # Frontmatter
//!
//! Omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]: Codex reads `name` and
//! `description` and takes tool dependencies from a separate
//! `agents/openai.yaml`, and the output lands in `.agents/`, the shared
//! portability directory. What separates this adapter from
//! [`crate::runtimes::portable`] is the tool vocabulary (`read_file`,
//! `shell`, `spawn_agent`), not the frontmatter.
//!
//! # Custom prompts (commands)
//!
//! A different format from the skill one above, and Codex's own docs are
//! explicit that it is a different *place* too: "Custom prompts require
//! explicit invocation and live in your local Codex home directory (for
//! example, `~/.codex`), so they're not shared through your repository"
//! (<https://learn.chatgpt.com/docs/custom-prompts>, retrieved 2026-09-06;
//! the page opens "Deprecated. Use skills for reusable prompts", so this is
//! Codex's own describe-then-deprecate account of the format, not a
//! moving target). Renders are laid out at project scope, and this
//! adapter's [`crate::RuntimePaths`] gives the same path for both scopes, so
//! `.codex/prompts/` here is written under the destination root the same way
//! `.codex/hooks.json` and `.codex/config.toml` already are, one directory
//! below where Codex itself would actually load it from. That divergence is
//! not new; this adapter's other two files already carry it.
//!
//! Frontmatter is `description` and `argument-hint` only — the same source:
//! "Description: Shown under the command name in the popup. Set it in YAML
//! front matter as `description:`", "Argument hint: Document expected
//! parameters with `argument-hint: KEY=<value>`". No `name` key appears in
//! either of the source's own examples, so this crate's command dialect
//! does not emit one — the filename is the name. Body placeholders:
//! `$1`-`$9` positional (1-based), `$ARGUMENTS` for the full tail, a named
//! `$KEY` set at invocation as `KEY=value`, and `$$` to escape a literal
//! `$` (same source, "Positional placeholders", "Named placeholders",
//! "Literal dollar signs").

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::mcp::{McpCapability, McpServer, render::render_codex_toml};
use crate::render::CommandFields;
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, Agent, AgentCapability, CodingAgentRuntime, Command,
    CommandCapability, ExportedFile, FieldNaming, FrontmatterDialect, Hook, HookCapability, Result,
    RuntimeId, RuntimePaths, ScopedRelative, Script, ScriptCapability, Skill, SkillCapability,
};

/// Codex's own custom-prompt frontmatter: `description` and
/// `argument-hint` only — see the module doc's "Custom prompts" section for
/// the source line. Neither `name` (the filename already names it), Claude
/// Code's own `arguments:` list, `model`, nor a tool list appears in Codex's
/// documented format, so none of the four is turned on here.
const COMMAND_FIELDS: CommandFields = CommandFields {
    field_naming: FieldNaming::Kebab,
    name: false,
    argument_hint: true,
    argument_names: false,
    model: false,
    tools_key: None,
};

/// Codex's own runtime adapter.
pub struct CodexCli;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".agents/skills"),
        agents_dir: ScopedRelative::same(".agents/agents"),
        commands_dir: Some(ScopedRelative::same(".codex/prompts")),
        scripts_dir: ScopedRelative::same(".agents/scripts"),
        hooks_file: Some(ScopedRelative::same(".codex/hooks.json")),
        mcp_config_file: Some(ScopedRelative::same(".codex/config.toml")),
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

impl CodingAgentRuntime for CodexCli {
    fn id(&self) -> RuntimeId {
        RuntimeId::CodexCli
    }
    fn display_name(&self) -> &'static str {
        "Codex CLI"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for CodexCli {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl AgentCapability for CodexCli {
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>> {
        standard::render_agent(self, agent, standard::registry())
    }
}

impl CommandCapability for CodexCli {
    fn render_command(&self, command: &Command) -> Result<Vec<ExportedFile>> {
        standard::render_command(self, command, &COMMAND_FIELDS, ".md", standard::registry())
    }
}

impl HookCapability for CodexCli {
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>> {
        standard::render_hooks(self, hooks, standard::registry())
    }
}

impl ScriptCapability for CodexCli {
    fn render_script(&self, script: &Script) -> Result<ExportedFile> {
        standard::render_script(self, script)
    }
}

impl McpCapability for CodexCli {
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>> {
        let content = render_codex_toml(server)?;
        Ok(standard::wrap_mcp_config(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// Codex's hooks page: Claude Code's event vocabulary, where hooks load from
/// (plugins included), and what a `Stop` hook's output can do.
const HOOKS: Evidence = Evidence {
    url: "https://developers.openai.com/codex/hooks",
    observed_on: capabilities::HOOKS_OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// `config.toml`, which documents one session-wide `approval_policy` and no
/// per-tool rules at all.
const CONFIG: Evidence = Evidence {
    url: "https://learn.chatgpt.com/docs/config-file/config-basic",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The skills reference, which documents the per-skill policy block.
const SKILLS: Evidence = Evidence {
    url: "https://learn.chatgpt.com/docs/build-skills",
    observed_on: capabilities::OVERRIDE_KEYS_OBSERVED,
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for CodexCli {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::CodexCli,
            assets: capabilities::derived_assets(RuntimeId::CodexCli),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::CodexCli),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(Claim::observed(Support::Native, HOOKS).with_spelling("decision: \"block\"").with_note("a `Stop` hook answering `decision: \"block\"` with a `reason` turns the reason into a continuation prompt")),
            overrides: capabilities::override_keys(
                dialect(),
                [capabilities::harness_key(
                    "policy.allow_implicit_invocation",
                    "whether the model may reach for this skill unprompted; no canonical field maps onto it",
                    SKILLS,
                )],
            ),
        }
    }
}

fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            Claim::observed(Support::Ignored, CONFIG).with_note(
                "the config file documents a global `approval_policy`, not a per-tool allow list",
            ),
        ),
        (
            "deny",
            Claim::observed(Support::Ignored, CONFIG)
                .with_note("the config file documents no deny list"),
        ),
        (
            "ask",
            Claim::observed(Support::Translated, CONFIG)
                .with_spelling("approval_policy = \"on-request\"")
                .with_note("a session-wide policy, not a per-tool ask rule"),
        ),
        (
            "mode",
            Claim::observed(Support::Native, CONFIG)
                .with_spelling("approval_policy")
                .with_note("`untrusted`, `on-request` or `never`, paired with `sandbox_mode`"),
        ),
    ]
    .into_iter()
    .map(|(concept, claim)| (concept.to_owned(), claim))
    .collect()
}

/// The events Codex CLI's own hooks page documents, spelled exactly as
/// Claude Code spells them, plus its own `Interrupt`.
const CODEX_EVENTS: &[&str] = &[
    "SessionStart",
    "SessionEnd",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "UserPromptSubmit",
    "SubagentStart",
    "SubagentStop",
    "Stop",
];

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            let claim = if CODEX_EVENTS.contains(event) {
                Claim::observed(Support::Native, HOOKS)
                    .with_spelling(event)
                    .with_note(
                        "the same event vocabulary Claude Code uses, read from `.codex/hooks.json`, a `[hooks]` table in `config.toml`, or an enabled plugin's `hooks/hooks.json`",
                    )
            } else if *event == "Interrupt" {
                Claim::observed(Support::Native, HOOKS).with_spelling(event).with_note(
                    "Codex CLI's own hook, with no Claude Code equivalent; fires on the main thread only, not for subagents",
                )
            } else {
                Claim::observed(Support::Ignored, HOOKS)
                    .with_note("the hooks page documents no event at this point in the loop")
            };
            ((*event).to_owned(), claim)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skill_path_under_shared_agents_dir() {
        let s = Skill::new("My Skill", "d", "b");
        let files = CodexCli.render_skill(&s).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".agents/skills/my-skill/SKILL.md")
        );
    }

    fn sample_command() -> Command {
        let mut c = Command::new("Ship it", "ship");
        c.description = Some("Cuts a release.".to_owned());
        c.argument_hint = Some("<version>".to_owned());
        c.model = Some("gpt-5".to_owned());
        c.tools = vec!["Read".to_owned()];
        c.body = "Cut the release for $ARGUMENTS.".to_owned();
        c
    }

    #[test]
    fn command_path_is_dot_codex_prompts() {
        let files = CodexCli.render_command(&sample_command()).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".codex/prompts/ship.md"));
    }

    #[test]
    fn command_frontmatter_keeps_description_and_hint_but_omits_the_rest() {
        let files = CodexCli.render_command(&sample_command()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("description: Cuts a release."), "{text}");
        assert!(text.contains("argument-hint: \"<version>\""), "{text}");
        // Codex's own docs show no `name`, `model`, or tool-list key for a
        // custom prompt.
        for absent in ["name:", "model:", "allowed-tools", "arguments:"] {
            assert!(!text.contains(absent), "{absent} leaked: {text}");
        }
    }

    #[test]
    fn command_arguments_section_names_one_based_positional_and_named_vars() {
        let mut command = sample_command();
        command.arguments = vec![crate::Argument::required("pr-number", "desc")];
        let files = CodexCli.render_command(&command).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("$ARGUMENTS"), "{text}");
        assert!(text.contains("`$1`/`$PR_NUMBER`"), "{text}");
    }

    #[test]
    fn mcp_config_path_is_codex_config_toml() {
        let files = CodexCli
            .render_mcp_server(&McpServer::http("x", "http://y"))
            .unwrap();
        assert_eq!(files[0].path, PathBuf::from(".codex/config.toml"));
        assert!(files[0].text().unwrap().contains("mcp_servers"));
    }

    #[test]
    fn hooks_path_is_codex_hooks_json() {
        let hook = Hook::command("x", "x", "PreToolUse", "echo");
        let files = CodexCli.render_hooks(&[hook]).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".codex/hooks.json"));
    }
}
