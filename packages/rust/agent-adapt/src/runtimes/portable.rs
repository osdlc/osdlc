//! The portable target — no product, the Agent Skills standard itself.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.agents/            (shared Agent Skills convention)
//! └── skills/<slug>/SKILL.md
//! ```
//!
//! # Why this exists
//!
//! Every other adapter in this module is a *product*: it names a client,
//! a directory that client reads, and a tool vocabulary that client
//! speaks. This one names none of them. It renders a skill the way the
//! specification defines it, for whichever of the ~46 clients that adopted
//! Agent Skills happens to read the tree — and, more to the point, so the
//! output survives the paths that *validate* rather than load:
//! `agentskills validate`, claude.ai upload, and the Skills API all reject
//! an unexpected frontmatter key as a hard error.
//!
//! # Frontmatter
//!
//! The dialect omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] — the six
//! keys (`argument-hint`, `arguments`, `model`, `context`,
//! `user-invocable`, `disable-model-invocation`) this crate renders that
//! are Claude Code extensions rather than spec fields. What is left is inside
//! [`crate::AGENT_SKILLS_FIELDS`], which is the point of the target.
//!
//! # Tool names
//!
//! No translation: `allowed-tools` keeps the canonical vocabulary. A
//! portable render has no target runtime to translate *to*, and the
//! canonical names are Claude Code's, which is the vocabulary the spec's
//! own examples use.
//!
//! # The path is not the conformance story
//!
//! `.agents/skills/` is a convention, not a requirement — the
//! specification disclaims file location entirely, and Codex, Amp and the
//! rest read that path by agreement rather than by standard. Publishing
//! into it confers nothing on its own; only the frontmatter makes output
//! conformant.
//!
//! # What it does not render
//!
//! Skills only. The specification covers `SKILL.md` and nothing else, so
//! there is no portable agent persona, hook, script, or MCP config to
//! render — a runtime-specific adapter is the honest place for those.
//! `AGENTS.md`, the other half of the portable layout, is a file several
//! skills contribute to; it cannot be owned by one skill's render and is
//! not emitted here.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{self, Claim, DeclaresCapabilities, RuntimeCapabilities, Support};
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, CodingAgentRuntime, ExportedFile, FieldNaming,
    FrontmatterDialect, Result, RuntimeId, RuntimePaths, ScopedRelative, Skill, SkillCapability,
};

/// Portable (standards-only) target adapter.
pub struct Portable;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".agents/skills"),
        // Declared for the shared `.agents/` convention's sake, but this
        // target implements neither `AgentCapability` nor
        // `ScriptCapability`: the specification says nothing about either,
        // so nothing portable can be rendered into them.
        agents_dir: ScopedRelative::same(".agents/agents"),
        commands_dir: None,
        scripts_dir: ScopedRelative::same(".agents/scripts"),
        // No hooks and no MCP config: neither is in the specification, and
        // a file at a guessed path is worse than no file.
        hooks_file: None,
        mcp_config_file: None,
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        // The spec's spelling is kebab and its field set is closed, so
        // every key outside it comes off here.
        omit_fields: AGENT_SKILLS_EXTENSION_FIELDS,
        // `user-invocable` is not a spec field at all; stating its default
        // explicitly would emit a key the validator rejects.
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for Portable {
    fn id(&self) -> RuntimeId {
        RuntimeId::Portable
    }
    fn display_name(&self) -> &'static str {
        "Portable (Agent Skills)"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for Portable {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

// ── Capability declaration ───────────────────────────────────────────────

impl DeclaresCapabilities for Portable {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::Portable,
            assets: capabilities::derived_assets(RuntimeId::Portable),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::Portable),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, capabilities::AGENT_SKILLS_SPEC)
                    .with_note("the specification defines no hooks, so no `Stop` hook runs"),
            ),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

/// The specification's only permission vocabulary is `allowed-tools`, marked
/// experimental and described as a pre-approval hint.
fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            Claim::observed(Support::Translated, capabilities::AGENT_SKILLS_SPEC)
                .with_spelling("allowed-tools")
                .with_note(
                    "the specification's space-separated pre-approval hint, marked experimental — a hint, not a rule set",
                ),
        ),
        (
            "deny",
            Claim::observed(Support::Ignored, capabilities::AGENT_SKILLS_SPEC)
                .with_note("the specification defines no deny vocabulary"),
        ),
        (
            "ask",
            Claim::observed(Support::Ignored, capabilities::AGENT_SKILLS_SPEC)
                .with_note("the specification defines no ask vocabulary"),
        ),
        (
            "mode",
            Claim::observed(Support::Ignored, capabilities::AGENT_SKILLS_SPEC)
                .with_note("the specification defines no approval model"),
        ),
    ]
    .into_iter()
    .map(|(concept, claim)| (concept.to_owned(), claim))
    .collect()
}

fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            (
                (*event).to_owned(),
                Claim::observed(Support::Rejected, capabilities::AGENT_SKILLS_SPEC).with_note(
                    "the specification defines no lifecycle events, so the portable target has no hooks file",
                ),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sample_skill() -> Skill {
        let mut s = Skill::new("My Skill", "A test skill", "Do the thing.");
        s.allowed_tools = vec!["Read".into(), "Write".into()];
        s.argument_hint = Some("<pr-number>".into());
        s.model_override = Some("opus".into());
        s.context_mode = Some("fork".into());
        s.user_invocable = false;
        s.disable_model_invocation = true;
        s
    }

    #[test]
    fn skill_path_under_shared_agents_dir() {
        let files = Portable.render_skill(&sample_skill()).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".agents/skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn frontmatter_carries_only_spec_fields() {
        let files = Portable.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        let frontmatter = text.split("---\n").nth(1).expect("frontmatter block");
        for key in ["name:", "description:", "allowed-tools:"] {
            assert!(frontmatter.contains(key), "spec field {key} kept");
        }
        for key in [
            "argument-hint",
            "model:",
            "context:",
            "user-invocable",
            "disable-model-invocation",
        ] {
            assert!(!frontmatter.contains(key), "extension key {key} dropped");
        }
    }

    #[test]
    fn tool_names_stay_canonical() {
        let files = Portable.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("Read"), "canonical Read kept: {text}");
        assert!(text.contains("Write"), "canonical Write kept: {text}");
        assert!(!text.contains("read_file"), "no runtime translation");
    }
}
