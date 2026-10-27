//! Generic npm-package runtime adapter.
//!
//! This isn't a coding-agent runtime in the usual sense — it's a
//! packaging target for sharing plugins via the npm registry or a flat
//! directory layout:
//!
//! ```text
//! <plugin-root>/
//! ├── skills/<slug>/SKILL.md
//! ├── agents/<slug>.md
//! └── scripts/<slug>.{sh,py,js}
//! ```
//!
//! It supports skills, agents, and scripts, but intentionally **does
//! not** implement [`crate::HookCapability`] or
//! [`crate::mcp::McpCapability`] — hooks and MCP servers don't make
//! sense in a standalone package that will be consumed by an unknown
//! runtime. Plugin composition functions that require those capabilities
//! will refuse to accept this runtime at compile time.
//!
//! # Frontmatter
//!
//! Omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`], for the same reason it
//! ships no hooks: the consuming runtime is unknown, so the only safe
//! assumption is the Agent Skills specification
//! ([`crate::AGENT_SKILLS_FIELDS`]). A package that carried Claude Code's
//! extension keys would be a Claude Code package wearing a neutral name.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{self, Claim, DeclaresCapabilities, RuntimeCapabilities, Support};
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, Agent, AgentCapability, CodingAgentRuntime, ExportedFile,
    FieldNaming, FrontmatterDialect, Result, RuntimeId, RuntimePaths, ScopedRelative, Script,
    ScriptCapability, Skill, SkillCapability,
};

/// Generic npm-package runtime adapter.
pub struct NpmPackage;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same("skills"),
        agents_dir: ScopedRelative::same("agents"),
        commands_dir: None,
        scripts_dir: ScopedRelative::same("scripts"),
        // No hooks file — npm packages don't ship hook configs.
        hooks_file: None,
        // No MCP config — npm packages don't register MCP servers with
        // a specific runtime.
        mcp_config_file: None,
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

impl CodingAgentRuntime for NpmPackage {
    fn id(&self) -> RuntimeId {
        RuntimeId::NpmPackage
    }
    fn display_name(&self) -> &'static str {
        "npm package"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for NpmPackage {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl AgentCapability for NpmPackage {
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>> {
        standard::render_agent(self, agent, standard::registry())
    }
}

impl ScriptCapability for NpmPackage {
    fn render_script(&self, script: &Script) -> Result<ExportedFile> {
        standard::render_script(self, script)
    }
}

// Intentionally no HookCapability or McpCapability impl — npm packages
// don't ship hook configs or MCP server registrations.

// ── Capability declaration ───────────────────────────────────────────────

impl DeclaresCapabilities for NpmPackage {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::NpmPackage,
            assets: capabilities::derived_assets(RuntimeId::NpmPackage),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::NpmPackage),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, capabilities::HARNESS_SURVEY)
                    .with_note("a package layout with no hooks file, so no `Stop` hook runs"),
            ),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

/// A package layout is not a harness: it has no configuration surface for a
/// permission rule and no hooks file for an event.
fn permissions() -> BTreeMap<String, Claim> {
    capabilities::PERMISSION_CONCEPTS
        .iter()
        .map(|(concept, _)| {
            (
                (*concept).to_owned(),
                Claim::observed(Support::Ignored, capabilities::HARNESS_SURVEY).with_note(
                    "a package layout, not a harness: there is no configuration surface to carry a rule",
                ),
            )
        })
        .collect()
}

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            (
                (*event).to_owned(),
                Claim::observed(Support::Rejected, capabilities::HARNESS_SURVEY).with_note(
                    "a package layout with no hooks file, so there is nowhere to write an event",
                ),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn skill_path_is_flat_skills_dir() {
        let s = Skill::new("My Skill", "d", "b");
        let files = NpmPackage.render_skill(&s).unwrap();
        assert_eq!(files[0].path, PathBuf::from("skills/my-skill/SKILL.md"));
    }

    #[test]
    fn no_hooks_or_mcp_config_paths() {
        assert!(NpmPackage.paths().hooks_file.is_none());
        assert!(NpmPackage.paths().mcp_config_file.is_none());
    }
}
