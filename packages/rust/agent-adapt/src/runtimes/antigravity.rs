//! Google Antigravity CLI (`agy`) runtime adapter, the successor to Gemini CLI.
//!
//! Antigravity's own documentation is the source for everything here
//! (<https://antigravity.google/docs/cli/gcli-migration> and
//! <https://antigravity.google/docs/cli/headless>, read 2026-10-09). It
//! documents two of the six asset kinds this crate models, and this adapter
//! renders exactly those two.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.agents/
//! ├── skills/<slug>/SKILL.md
//! └── mcp_config.json        (MCP config)
//! ```
//!
//! User scope: skills under `~/.gemini/antigravity-cli/skills/`, MCP config at
//! `~/.gemini/config/mcp_config.json`. Context files (`GEMINI.md`,
//! `AGENTS.md`) are unchanged from Gemini CLI and are not rendered by this
//! crate.
//!
//! # What is deliberately not rendered
//!
//! * **Commands.** Antigravity converts a custom command into a skill on
//!   import and has no command file or TOML format of its own, so there is
//!   no command surface to render. Author a skill instead; the
//!   [`crate::runtimes::command_renderer_for`] lookup answers `None`.
//! * **Hooks and agents.** The pages above document no hook configuration
//!   format and no subagent file format. A renderer at a guessed path is
//!   worse than no renderer, so neither capability trait is implemented, every
//!   hook event is declared [`Support::Rejected`], and
//!   [`RuntimePaths::agents_dir`] is a placeholder the struct requires.
//! * **Scripts.** Peer scripts exist to be referenced by hooks, which this
//!   adapter cannot render, and the pages document no scripts directory.
//!   A skill's own `scripts/` are peer resources inside its slug directory.
//!
//! # MCP
//!
//! `{ "mcpServers": { … } }` with `serverUrl` as the URL key for an HTTP
//! server. The Gemini CLI spellings `url` and `httpUrl` are no longer read.
//!
//! # Frontmatter
//!
//! Omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]. Those six keys are Claude
//! Code's, not the Agent Skills specification's, and the Antigravity pages
//! document none of them; emitting them here only risks a validating
//! consumer rejecting the file.
//!
//! # Tool names
//!
//! The pages name no tool vocabulary, so every tool name passes through
//! unchanged. See [`crate::tools`].

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::mcp::{McpCapability, McpServer, render::render_antigravity_json};
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, CodingAgentRuntime, ExportedFile, FieldNaming,
    FrontmatterDialect, Result, RuntimeId, RuntimePaths, ScopedRelative, Skill, SkillCapability,
};

/// Antigravity CLI runtime adapter.
pub struct Antigravity;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative {
            project: ".agents/skills".into(),
            user: ".gemini/antigravity-cli/skills".into(),
        },
        // Placeholders the struct requires. The pages document no agents or
        // scripts directory, and this adapter implements neither
        // `AgentCapability` nor `ScriptCapability`.
        agents_dir: ScopedRelative::same(".agents/agents"),
        // Commands become skills on import; there is no command directory.
        commands_dir: None,
        scripts_dir: ScopedRelative::same(".agents/scripts"),
        // No hook configuration format is documented.
        hooks_file: None,
        mcp_config_file: Some(ScopedRelative {
            project: ".agents/mcp_config.json".into(),
            user: ".gemini/config/mcp_config.json".into(),
        }),
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

impl CodingAgentRuntime for Antigravity {
    fn id(&self) -> RuntimeId {
        RuntimeId::Antigravity
    }
    fn display_name(&self) -> &'static str {
        "Antigravity"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for Antigravity {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl McpCapability for Antigravity {
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>> {
        let content = render_antigravity_json(server)?;
        Ok(standard::wrap_mcp_config(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// The Gemini CLI migration guide: skills and MCP locations, the `serverUrl`
/// key, the permissions file, and the statement that commands become skills.
const MIGRATION: Evidence = Evidence {
    url: "https://antigravity.google/docs/cli/gcli-migration",
    observed_on: "2026-10-09",
    version: capabilities::UNVERSIONED,
};

/// The headless-mode reference. It documents flags and output, and no hook
/// or lifecycle surface.
const HEADLESS: Evidence = Evidence {
    url: "https://antigravity.google/docs/cli/headless",
    observed_on: "2026-10-09",
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for Antigravity {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::Antigravity,
            assets: capabilities::derived_assets(RuntimeId::Antigravity),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::Antigravity),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, HEADLESS)
                    .with_note("no hook format is documented, and this crate renders none"),
            ),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

fn permissions() -> BTreeMap<String, Claim> {
    let undocumented = |concept: &str| {
        (
            concept.to_owned(),
            Claim::observed(Support::Ignored, MIGRATION).with_note(
                "the migration guide documents only `permissions.allow` rules in `settings.json`",
            ),
        )
    };
    BTreeMap::from([
        (
            "allow".to_owned(),
            Claim::observed(Support::Translated, MIGRATION)
                .with_spelling("permissions.allow")
                .with_note(
                    "rules in `~/.gemini/antigravity-cli/settings.json`, e.g. `command(git)`",
                ),
        ),
        undocumented("deny"),
        undocumented("ask"),
        undocumented("mode"),
    ])
}

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            (
                (*event).to_owned(),
                Claim::observed(Support::Rejected, HEADLESS).with_note(
                    "no hook configuration format is documented, so this crate renders none",
                ),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Scope;
    use std::path::{Path, PathBuf};

    #[test]
    fn skill_path_under_agents_skills() {
        let s = Skill::new("My Skill", "d", "b");
        let files = Antigravity.render_skill(&s).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".agents/skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn user_scope_skills_live_under_the_antigravity_cli_root() {
        assert_eq!(
            Antigravity
                .paths()
                .skills_dir_for(Path::new("/home/u"), Scope::User),
            PathBuf::from("/home/u/.gemini/antigravity-cli/skills")
        );
    }

    #[test]
    fn skill_tool_names_pass_through_untranslated() {
        let mut s = Skill::new("x", "d", "b");
        s.allowed_tools = vec!["Read".into(), "Bash".into()];
        let files = Antigravity.render_skill(&s).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("allowed-tools: Read Bash"), "{text}");
    }

    #[test]
    fn mcp_config_path_is_agents_mcp_config_json() {
        let files = Antigravity
            .render_mcp_server(&McpServer::http("x", "http://y"))
            .unwrap();
        assert_eq!(files[0].path, PathBuf::from(".agents/mcp_config.json"));
        let text = files[0].text().unwrap();
        assert!(text.contains("serverUrl"), "{text}");
        assert!(!text.contains("httpUrl"), "{text}");
    }

    #[test]
    fn user_scope_mcp_config_is_under_gemini_config() {
        let mcp = Antigravity.paths().mcp_config_file.clone().unwrap();
        assert_eq!(
            mcp.for_scope(Scope::User),
            &PathBuf::from(".gemini/config/mcp_config.json")
        );
    }

    #[test]
    fn commands_hooks_agents_and_scripts_are_not_rendered() {
        use crate::runtimes::{
            agent_renderer_for, command_renderer_for, hook_renderer_for, script_renderer_for,
        };
        let id = RuntimeId::Antigravity;
        assert!(command_renderer_for(id).is_none());
        assert!(hook_renderer_for(id).is_none());
        assert!(agent_renderer_for(id).is_none());
        assert!(script_renderer_for(id).is_none());
    }
}
