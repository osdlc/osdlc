//! Pi (`earendil-works/pi`) runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/.pi/
//! └── skills/<slug>/SKILL.md
//! ```
//!
//! User scope is `~/.pi/agent/skills` (`getAgentDir()` in
//! `packages/coding-agent/src/config.ts`). Pi also reads `.agents/skills`
//! and `~/.agents/skills`, per `packages/coding-agent/docs/skills.md`, so a
//! skill collection publishing to [`RuntimeId::Portable`] already reaches it.
//!
//! Every fact here is read from Pi's repository at `PI_COMMIT`. The skill
//! rules are in `packages/coding-agent/src/core/skills.ts`: Pi takes the
//! skill's name from `name`, else the parent directory. It checks the name
//! (at most 64 characters, `[a-z0-9-]`, no edge or double hyphens) as
//! warnings only, and refuses a skill only when `description` is missing.
//!
//! # Frontmatter
//!
//! Standard Agent Skills, kebab-case. Pi's frontmatter type names
//! `disable-model-invocation` under that spelling and with Cursor's meaning:
//! the skill is left out of the system prompt and reached only by
//! `/skill:<name>`. So, as with Cursor, that key is kept and the other five
//! extension keys are omitted. `allowed-tools` is rendered because it is a
//! spec field, but Pi does not read it: see the `allow` permission claim.
//!
//! # Tool names
//!
//! No translation. Pi does not read `allowed-tools`, so no tool name in a
//! skill's frontmatter reaches it.
//!
//! # What it does not render
//!
//! Skills only. Pi's prompt templates, extensions and packages are not
//! modelled here.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::runtimes::standard;
use crate::{
    CodingAgentRuntime, ExportedFile, FieldNaming, FrontmatterDialect, Result, RuntimeId,
    RuntimePaths, ScopedRelative, Skill, SkillCapability,
};

/// [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] minus `disable_model_invocation`,
/// the one Pi reads.
const OMITTED_EXTENSION_FIELDS: &[&str] = &[
    "argument_hint",
    "arguments",
    "model",
    "context",
    "user_invocable",
];

/// Pi runtime adapter.
pub struct Pi;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative {
            project: ".pi/skills".into(),
            user: ".pi/agent/skills".into(),
        },
        // Placeholders the struct requires. Pi reads no agents or scripts
        // directory, and this adapter implements neither `AgentCapability`
        // nor `ScriptCapability`. Check Pi before writing into either.
        agents_dir: ScopedRelative::same(".pi/agents"),
        commands_dir: None,
        scripts_dir: ScopedRelative::same(".pi/scripts"),
        // Pi takes lifecycle events as TypeScript extensions, not a config
        // file, so there is nowhere to write either.
        hooks_file: None,
        mcp_config_file: None,
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        omit_fields: OMITTED_EXTENSION_FIELDS,
        // Pi reads no `user-invocable` key.
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for Pi {
    fn id(&self) -> RuntimeId {
        RuntimeId::Pi
    }
    fn display_name(&self) -> &'static str {
        "Pi"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for Pi {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// The one place Pi's pinned commit hash is written.
macro_rules! pi_commit_hash {
    () => {
        "88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    };
}

/// A file in Pi's repository at the pinned commit.
macro_rules! pi_source {
    ($path:literal) => {
        concat!(
            "https://github.com/earendil-works/pi/blob/",
            $crate::runtimes::pi::pi_commit_hash!(),
            "/",
            $path
        )
    };
}
pub(crate) use {pi_commit_hash, pi_source};

/// The pinned commit every Pi reading is taken from.
pub(crate) const PI_COMMIT: &str = concat!("earendil-works/pi@", pi_commit_hash!());

/// The date Pi's source was read, for this module and for Pi's skill-call
/// syntax in [`crate::skill_call`].
pub(crate) const OBSERVED: &str = "2026-10-01";

/// The skill loader: frontmatter type, name and description rules, and the
/// system-prompt text.
const SKILLS: Evidence = Evidence {
    url: pi_source!("packages/coding-agent/src/core/skills.ts"),
    observed_on: OBSERVED,
    version: PI_COMMIT,
};

/// The repository README, whose "Permissions & Containerization" section
/// states that Pi has no permission system.
const README: Evidence = Evidence {
    url: pi_source!("README.md"),
    observed_on: OBSERVED,
    version: PI_COMMIT,
};

impl DeclaresCapabilities for Pi {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::Pi,
            assets: capabilities::derived_assets(RuntimeId::Pi),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::Pi),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(Claim::observed(Support::Ignored, README).with_note("Pi takes lifecycle events as TypeScript extensions, and this crate renders none")),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

/// Pi has no permission system, so every concept is ignored.
fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            Claim::observed(Support::Ignored, SKILLS).with_note(
                "Pi tolerates `allowed-tools` in frontmatter but never reads it; tools run with the user's own permissions",
            ),
        ),
        (
            "deny",
            Claim::observed(Support::Ignored, README)
                .with_note("no built-in permission system, so nothing to deny"),
        ),
        (
            "ask",
            Claim::observed(Support::Ignored, README)
                .with_note("no built-in permission system, so nothing prompts"),
        ),
        (
            "mode",
            Claim::observed(Support::Ignored, README)
                .with_note("no built-in permission system, so no approval mode"),
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
                Claim::observed(Support::Rejected, README).with_note(
                    "Pi takes lifecycle events as TypeScript extensions, not a hooks file, so this crate renders none",
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
        s.allowed_tools = vec!["Read".into(), "Bash".into()];
        s.argument_hint = Some("<pr-number>".into());
        s.model_override = Some("opus".into());
        s.context_mode = Some("fork".into());
        s.user_invocable = false;
        s.disable_model_invocation = true;
        s
    }

    #[test]
    fn skill_path_under_pi_skills() {
        let files = Pi.render_skill(&sample_skill()).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".pi/skills/my-skill/SKILL.md"));
    }

    #[test]
    fn user_scope_is_under_pi_agent() {
        assert_eq!(
            Pi.paths()
                .skills_dir_for(std::path::Path::new("/home/u"), crate::Scope::User),
            PathBuf::from("/home/u/.pi/agent/skills")
        );
    }

    /// Same invariant as Cursor's: a new extension key fails here until
    /// someone reads Pi's frontmatter type for it.
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
        assert_eq!(covered, all);
    }

    #[test]
    fn frontmatter_keeps_spec_fields_and_disable_model_invocation() {
        let files = Pi.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        let frontmatter = text.split("---\n").nth(1).expect("frontmatter block");
        for key in [
            "name:",
            "description:",
            "allowed-tools:",
            "disable-model-invocation",
        ] {
            assert!(frontmatter.contains(key), "{key} kept: {frontmatter}");
        }
        for key in ["argument-hint", "model:", "context:", "user-invocable"] {
            assert!(!frontmatter.contains(key), "{key} dropped: {frontmatter}");
        }
    }

    #[test]
    fn tool_names_stay_canonical() {
        let files = Pi.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("allowed-tools: Read Bash"), "{text}");
    }

    #[test]
    fn allowed_tools_is_declared_unread() {
        let declaration = Pi.capabilities();
        assert_eq!(declaration.permissions["allow"].support, Support::Ignored);
    }
}
