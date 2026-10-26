//! Sourcegraph Amp runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.agents/            (shared Agent Skills convention)
//! ├── skills/<slug>/SKILL.md
//! ├── agents/<slug>.md
//! ├── scripts/<slug>.{sh,py,js}
//! ├── hooks.json
//! └── settings.json             (MCP config, Claude-Code-compatible shape)
//! ```
//!
//! Amp uses the shared `.agents/` directory convention for skills (like
//! Codex CLI) and keeps its own tool-name vocabulary where most names
//! match Claude Code but a few diverge (e.g. `create_file` for `Write`,
//! `read_web_page` for `WebFetch`, `get_diagnostics` for `LSP`).
//!
//! # Frontmatter
//!
//! Omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]. Amp writes into
//! `.agents/`, which is read by convention rather than by any one
//! product, so anything it emits there should be something the Agent
//! Skills specification defines. Only the tool vocabulary distinguishes
//! this render from [`crate::runtimes::portable`].

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, AssetKind, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::mcp::{McpCapability, McpServer, render::render_claude_json};
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, Agent, AgentCapability, CodingAgentRuntime, ExportedFile,
    FieldNaming, FrontmatterDialect, Hook, HookCapability, Result, RuntimeId, RuntimePaths,
    ScopedRelative, Script, ScriptCapability, Skill, SkillCapability,
};

/// Amp runtime adapter.
pub struct Amp;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".agents/skills"),
        agents_dir: ScopedRelative::same(".agents/agents"),
        commands_dir: None,
        scripts_dir: ScopedRelative::same(".agents/scripts"),
        hooks_file: Some(ScopedRelative::same(".agents/hooks.json")),
        mcp_config_file: Some(ScopedRelative::same(".agents/settings.json")),
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

impl CodingAgentRuntime for Amp {
    fn id(&self) -> RuntimeId {
        RuntimeId::Amp
    }
    fn display_name(&self) -> &'static str {
        "Amp"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for Amp {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl AgentCapability for Amp {
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>> {
        standard::render_agent(self, agent, standard::registry())
    }
}

impl HookCapability for Amp {
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>> {
        standard::render_hooks(self, hooks, standard::registry())
    }
}

impl ScriptCapability for Amp {
    fn render_script(&self, script: &Script) -> Result<ExportedFile> {
        standard::render_script(self, script)
    }
}

impl McpCapability for Amp {
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>> {
        let content = render_claude_json(server)?;
        Ok(standard::wrap_mcp_config(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// Amp's plugin documentation, which is where its hooks live — there is no
/// hooks file to read.
const PLUGINS: Evidence = Evidence {
    url: "https://ampcode.com/docs/customize/plugins",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The manual, which documents no declarative permission surface at all.
const MANUAL: Evidence = Evidence {
    url: "https://ampcode.com/manual",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for Amp {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::Amp,
            assets: assets(),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::Amp),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, PLUGINS)
                    .with_note("hooks are plugin code, and this crate renders no hooks Amp reads"),
            ),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

/// The derived asset claims plus the caveat the derivation cannot know: this
/// crate renders a hooks file Amp does not read.
fn assets() -> BTreeMap<AssetKind, Claim> {
    let mut assets = capabilities::derived_assets(RuntimeId::Amp);
    let hook = assets
        .get_mut(&AssetKind::Hook)
        .expect("derived_assets answers every asset kind");
    hook.note = Some(
        "this crate writes `.agents/hooks.json`; Amp takes hooks as `.ts`/`.js` plugin modules and documents no such file",
    );
    hook.evidence = Some(PLUGINS);
    assets
}

fn permissions() -> BTreeMap<String, Claim> {
    capabilities::PERMISSION_CONCEPTS
        .iter()
        .map(|(concept, _)| {
            (
                (*concept).to_owned(),
                Claim::observed(Support::Ignored, MANUAL)
                    .with_note("the manual documents no declarative permission surface"),
            )
        })
        .collect()
}

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            let claim = match *event {
                "PreToolUse" => plugin_event("tool.call"),
                "PostToolUse" => plugin_event("tool.result"),
                "UserPromptSubmit" => plugin_event("agent.start"),
                "Stop" => plugin_event("agent.end"),
                "SessionStart" => plugin_event("session.start"),
                _ => Claim::observed(Support::Ignored, PLUGINS).with_note(
                    "hooks are plugin modules and none is documented for this point in the loop; the `hooks.json` this crate writes is not read",
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
            "a plugin event handled through `amp.on(...)`; the `hooks.json` this crate writes is not read",
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skill_path_under_shared_agents_dir() {
        let s = Skill::new("My Skill", "d", "b");
        let files = Amp.render_skill(&s).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".agents/skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn write_tool_is_create_file_for_amp() {
        let mut s = Skill::new("x", "d", "b");
        s.allowed_tools = vec!["Write".into()];
        let files = Amp.render_skill(&s).unwrap();
        assert!(
            files[0]
                .text()
                .unwrap()
                .contains("allowed-tools: create_file")
        );
    }
}
