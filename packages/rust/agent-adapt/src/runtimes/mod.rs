//! Concrete [`crate::CodingAgentRuntime`] implementations for every
//! supported runtime.
//!
//! Each submodule is a thin adapter: it declares the runtime's
//! [`crate::RuntimePaths`] and [`crate::FrontmatterDialect`] as
//! `&'static` values, then implements the peer capability traits by
//! delegating to the shared helpers in [`crate::render`] and
//! [`crate::mcp::render`].
//!
//! # What each adapter contributes
//!
//! * **Paths** — where skills, agents, hooks, scripts, and MCP config
//!   live in the runtime's on-disk layout (e.g. `.claude/skills/` for
//!   Claude Code, `.agents/skills/` for Antigravity).
//! * **Frontmatter dialect** — whether field names are kebab or snake
//!   case, which fields to omit, etc. Every adapter but
//!   [`claude_code`] omits [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]: those
//!   six keys are Claude Code extensions, and a client that validates
//!   rather than loads rejects them. Each adapter's module doc says so in
//!   its own words, because `omit_fields: &[]` reads as "nothing to omit"
//!   when it in fact meant "nobody wired this yet".
//! * **Capability opt-in** — a runtime that doesn't support an asset type
//!   (e.g. `npm_package` has no hooks) doesn't implement the matching trait.
//! * **MCP format** — JSON vs TOML, `url` vs `serverUrl`, etc. Delegates
//!   to [`crate::mcp::render`].
//!
//! Call [`all`] to get a heterogeneous list of every *full-stack* built-in
//! runtime (as `Box<dyn CodingAgentRuntime>`), [`for_id`] to look any
//! runtime up by [`crate::RuntimeId`] regardless of which capabilities it
//! implements, or one of the six per-capability lookups —
//! [`skill_renderer_for`], [`agent_renderer_for`], [`command_renderer_for`],
//! [`hook_renderer_for`], [`mcp_renderer_for`], [`script_renderer_for`] — to
//! get one back typed to the capability a caller actually needs. There are
//! six rather than one because the six disagree: [`copilot`] implements
//! [`crate::CommandCapability`] alone, [`portable`], [`cursor`] and [`pi`]
//! implement [`crate::SkillCapability`] alone, and [`npm_package`] renders skills,
//! agents and scripts but has no hooks and no MCP config.
//!
//! Together they are the whole "which runtime renders what" answer, and
//! `capabilities::derived_assets` reads all six rather than
//! restating them.
//!
//! Every adapter also implements [`crate::capabilities::DeclaresCapabilities`],
//! saying what it does with each frontmatter field, tool name, permission
//! concept and hook event. [`declaration_for`] looks one up.

pub mod amp;
pub mod antigravity;
pub mod claude_code;
pub mod codex_cli;
pub mod copilot;
pub mod cursor;
pub mod npm_package;
pub mod opencode;
pub mod pi;
pub mod portable;
pub(crate) mod standard;

pub use amp::Amp;
pub use antigravity::Antigravity;
pub use claude_code::ClaudeCode;
pub use codex_cli::CodexCli;
pub use copilot::Copilot;
pub use cursor::Cursor;
pub use npm_package::NpmPackage;
pub use opencode::OpenCode;
pub use pi::Pi;
pub use portable::Portable;

use crate::capabilities::{DeclaresCapabilities, RuntimeCapabilities};
use crate::mcp::McpCapability;
use crate::{
    AgentCapability, CodingAgentRuntime, CommandCapability, HookCapability, RuntimeId,
    ScriptCapability, SkillCapability,
};

/// Return every *full-stack* built-in runtime as a boxed trait object, in a
/// stable order (matching [`RuntimeId`] variant declaration order).
///
/// "Full-stack" is the contract this list actually promises and the tests
/// below check: every entry renders skills (`skill_renderer_for` is `Some`
/// for it). [`RuntimeId::GithubCopilot`] is deliberately absent — it
/// implements [`CommandCapability`] alone today (see
/// [`crate::runtimes::copilot`]) — so a caller enumerating "every runtime"
/// for a skill- or agent-shaped operation does not have to filter it back
/// out. [`command_renderer_for`] is the list to walk for command-shaped
/// destinations, and covers Copilot.
pub fn all() -> Vec<Box<dyn CodingAgentRuntime>> {
    vec![
        Box::new(ClaudeCode),
        Box::new(Antigravity),
        Box::new(CodexCli),
        Box::new(OpenCode),
        Box::new(Amp),
        Box::new(Cursor),
        Box::new(NpmPackage),
        Box::new(Portable),
        Box::new(Pi),
    ]
}

/// Look up a runtime by [`RuntimeId`]. Returns `None` only if a new
/// variant is added to the enum and this function isn't updated in the
/// same commit (enforced by the exhaustive match).
pub fn for_id(id: RuntimeId) -> Option<Box<dyn CodingAgentRuntime>> {
    Some(match id {
        RuntimeId::ClaudeCode => Box::new(ClaudeCode),
        RuntimeId::Antigravity => Box::new(Antigravity),
        RuntimeId::CodexCli => Box::new(CodexCli),
        RuntimeId::OpenCode => Box::new(OpenCode),
        RuntimeId::Amp => Box::new(Amp),
        RuntimeId::Cursor => Box::new(Cursor),
        RuntimeId::GithubCopilot => Box::new(Copilot),
        RuntimeId::NpmPackage => Box::new(NpmPackage),
        RuntimeId::Portable => Box::new(Portable),
        RuntimeId::Pi => Box::new(Pi),
    })
}

/// One runtime's own capability declaration.
///
/// Total, unlike the renderer lookups: every runtime declares, including
/// [`RuntimeId::GithubCopilot`], which [`all`] omits because it renders
/// commands and nothing else.
pub fn declaration_for(id: RuntimeId) -> RuntimeCapabilities {
    match id {
        RuntimeId::ClaudeCode => ClaudeCode.capabilities(),
        RuntimeId::Antigravity => Antigravity.capabilities(),
        RuntimeId::CodexCli => CodexCli.capabilities(),
        RuntimeId::OpenCode => OpenCode.capabilities(),
        RuntimeId::Amp => Amp.capabilities(),
        RuntimeId::Cursor => Cursor.capabilities(),
        RuntimeId::GithubCopilot => Copilot.capabilities(),
        RuntimeId::NpmPackage => NpmPackage.capabilities(),
        RuntimeId::Portable => Portable.capabilities(),
        RuntimeId::Pi => Pi.capabilities(),
    }
}

/// Which of a [`crate::Skill`]'s per-target override keys this runtime's render
/// already writes byte for byte — the redundant-override diagnostic.
///
/// A second render of the same skill, and deliberately so: the report is not
/// a file, and threading it out of [`SkillCapability::render_skill`] would
/// put a diagnostic on the return type of every renderer, peer resources
/// included. Call it only when [`crate::Skill::overrides`] is non-empty, which is
/// the ordinary note's answer.
///
/// `None` for a runtime that renders no skills — the same signal
/// [`skill_renderer_for`] gives.
///
/// # Errors
///
/// The refusal [`crate::render::render_skill_md`] raises for a name with no
/// legal slug.
///
/// Hidden from the docs and outside the semver promise: an internal helper
/// that `tradecraft-core` calls.
#[doc(hidden)]
pub fn redundant_skill_overrides(
    id: RuntimeId,
    skill: &crate::Skill,
) -> Option<crate::Result<Vec<String>>> {
    let runtime = for_id(id)?;
    skill_renderer_for(id)?;
    Some(
        crate::render::render_skill_md_reporting(
            skill,
            id,
            runtime.frontmatter_dialect(),
            standard::registry(),
        )
        .map(|(_, redundant)| redundant),
    )
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`CommandCapability`].
///
/// `Some` for every runtime whose command format this crate has verified
/// against its current docs and rendered: Claude Code, Codex CLI,
/// OpenCode, and GitHub Copilot. `None` for Antigravity (commands become
/// skills; no command format exists), Amp (no command format
/// documented), the packaging targets (`NpmPackage`, `Portable` — neither
/// names a consuming harness to have a command convention), and any future
/// variant this function isn't updated for in the same commit — a runtime
/// whose layout is unknown gets `None` rather than a guessed path. See
/// [`crate::RuntimePaths::commands_dir`].
pub fn command_renderer_for(id: RuntimeId) -> Option<Box<dyn CommandCapability>> {
    match id {
        RuntimeId::ClaudeCode => Some(Box::new(ClaudeCode)),
        RuntimeId::CodexCli => Some(Box::new(CodexCli)),
        RuntimeId::OpenCode => Some(Box::new(OpenCode)),
        RuntimeId::GithubCopilot => Some(Box::new(Copilot)),
        RuntimeId::Antigravity
        | RuntimeId::Amp
        | RuntimeId::Cursor
        | RuntimeId::NpmPackage
        | RuntimeId::Portable
        | RuntimeId::Pi => None,
    }
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`AgentCapability`], the
/// peer of [`skill_renderer_for`].
///
/// `None` for [`RuntimeId::Antigravity`], whose subagent file format is
/// undocumented, and for [`RuntimeId::Portable`], a full-stack built-in with no
/// agent layout: the portable Agent Skills shape defines `skills/` and
/// `AGENTS.md` and has no per-agent file to write. Also `None` for
/// [`RuntimeId::GithubCopilot`] — see [`crate::runtimes::copilot`]'s module
/// doc for why this crate has not verified an agent layout for it yet.
/// Callers get `None` rather than a renderer that would invent a path the
/// standard does not define.
pub fn agent_renderer_for(id: RuntimeId) -> Option<Box<dyn AgentCapability>> {
    Some(match id {
        RuntimeId::ClaudeCode => Box::new(ClaudeCode),
        RuntimeId::CodexCli => Box::new(CodexCli),
        RuntimeId::OpenCode => Box::new(OpenCode),
        RuntimeId::Amp => Box::new(Amp),
        RuntimeId::NpmPackage => Box::new(NpmPackage),
        RuntimeId::Antigravity
        | RuntimeId::Cursor
        | RuntimeId::Portable
        | RuntimeId::Pi
        | RuntimeId::GithubCopilot => {
            return None;
        }
    })
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`SkillCapability`], so
/// callers can call `render_skill` without matching on the concrete
/// runtime type themselves. Every full-stack built-in runtime renders
/// skills, so this returns `Some` for all of them; `None` for
/// [`RuntimeId::GithubCopilot`] (see [`crate::runtimes::copilot`]'s module
/// doc) and for any future runtime that might not.
pub fn skill_renderer_for(id: RuntimeId) -> Option<Box<dyn SkillCapability>> {
    Some(match id {
        RuntimeId::ClaudeCode => Box::new(ClaudeCode),
        RuntimeId::Antigravity => Box::new(Antigravity),
        RuntimeId::CodexCli => Box::new(CodexCli),
        RuntimeId::OpenCode => Box::new(OpenCode),
        RuntimeId::Amp => Box::new(Amp),
        RuntimeId::Cursor => Box::new(Cursor),
        RuntimeId::NpmPackage => Box::new(NpmPackage),
        RuntimeId::Portable => Box::new(Portable),
        RuntimeId::Pi => Box::new(Pi),
        RuntimeId::GithubCopilot => return None,
    })
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`HookCapability`].
///
/// `Some` for every runtime whose [`crate::RuntimePaths::hooks_file`] is set;
/// `None` for the rest, where there is nowhere to put a hook.
///
/// Whether the harness on the far side *reads* the file this renders is a
/// separate question, and the one [`crate::capabilities`]'s hook-event rows
/// answer with a source: OpenCode and Amp both take hooks as plugin code
/// rather than as a config file.
pub fn hook_renderer_for(id: RuntimeId) -> Option<Box<dyn HookCapability>> {
    match id {
        RuntimeId::ClaudeCode => Some(Box::new(ClaudeCode)),
        RuntimeId::CodexCli => Some(Box::new(CodexCli)),
        RuntimeId::OpenCode => Some(Box::new(OpenCode)),
        RuntimeId::Amp => Some(Box::new(Amp)),
        RuntimeId::Cursor => Some(Box::new(Cursor)),
        RuntimeId::Antigravity
        | RuntimeId::GithubCopilot
        | RuntimeId::NpmPackage
        | RuntimeId::Portable
        | RuntimeId::Pi => None,
    }
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`McpCapability`].
///
/// `Some` for every runtime whose [`crate::RuntimePaths::mcp_config_file`] is
/// set; the rest get no renderer.
pub fn mcp_renderer_for(id: RuntimeId) -> Option<Box<dyn McpCapability>> {
    match id {
        RuntimeId::ClaudeCode => Some(Box::new(ClaudeCode)),
        RuntimeId::CodexCli => Some(Box::new(CodexCli)),
        RuntimeId::Antigravity => Some(Box::new(Antigravity)),
        RuntimeId::OpenCode => Some(Box::new(OpenCode)),
        RuntimeId::Amp => Some(Box::new(Amp)),
        RuntimeId::Cursor
        | RuntimeId::GithubCopilot
        | RuntimeId::NpmPackage
        | RuntimeId::Portable
        | RuntimeId::Pi => None,
    }
}

/// Look up a runtime by [`RuntimeId`] as a boxed [`ScriptCapability`].
///
/// `Some` for every runtime that carries peer scripts beside its assets:
/// the four hook-capable ones plus [`RuntimeId::NpmPackage`], whose
/// `scripts/` directory is part of the package layout. `None` for
/// [`RuntimeId::Portable`] — the Agent Skills shape puts scripts *inside* a
/// skill folder, not in a target-level directory — and for
/// [`RuntimeId::GithubCopilot`], which this crate renders commands for and
/// nothing else.
pub fn script_renderer_for(id: RuntimeId) -> Option<Box<dyn ScriptCapability>> {
    match id {
        RuntimeId::ClaudeCode => Some(Box::new(ClaudeCode)),
        RuntimeId::CodexCli => Some(Box::new(CodexCli)),
        RuntimeId::OpenCode => Some(Box::new(OpenCode)),
        RuntimeId::Amp => Some(Box::new(Amp)),
        RuntimeId::NpmPackage => Some(Box::new(NpmPackage)),
        RuntimeId::Antigravity
        | RuntimeId::Cursor
        | RuntimeId::GithubCopilot
        | RuntimeId::Portable
        | RuntimeId::Pi => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_returns_every_runtime() {
        assert_eq!(all().len(), 9);
    }

    /// Every dialect's omit list, held against the one thing that decides
    /// it: whether that harness's own documentation names the key.
    ///
    /// [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] records where this crate first
    /// read the six keys, not a claim that nobody else reads them. Cursor and
    /// Pi both read `disable-model-invocation`, so they keep that one and omit
    /// the other five.
    #[test]
    fn a_dialect_omits_exactly_the_extension_keys_its_harness_does_not_document() {
        for runtime in all() {
            let omitted = runtime.frontmatter_dialect().omit_fields;
            for field in crate::AGENT_SKILLS_EXTENSION_FIELDS {
                let documented = match runtime.id() {
                    RuntimeId::ClaudeCode => true,
                    RuntimeId::Cursor | RuntimeId::Pi => *field == "disable_model_invocation",
                    _ => false,
                };
                assert_eq!(
                    !omitted.contains(field),
                    documented,
                    "{:?} and {field}",
                    runtime.id()
                );
            }
        }
    }

    #[test]
    fn skill_renderer_for_covers_every_runtime() {
        let skill = crate::Skill::new("Probe", "d", "b");
        for runtime in all() {
            let renderer = skill_renderer_for(runtime.id()).expect("every built-in renders skills");
            assert_eq!(renderer.id(), runtime.id());
            assert!(!renderer.render_skill(&skill).unwrap().is_empty());
        }
    }

    #[test]
    fn for_id_returns_matching_runtime() {
        assert_eq!(
            for_id(RuntimeId::ClaudeCode).unwrap().id(),
            RuntimeId::ClaudeCode
        );
        assert_eq!(
            for_id(RuntimeId::Antigravity).unwrap().id(),
            RuntimeId::Antigravity
        );
        assert_eq!(
            for_id(RuntimeId::CodexCli).unwrap().id(),
            RuntimeId::CodexCli
        );
        assert_eq!(
            for_id(RuntimeId::OpenCode).unwrap().id(),
            RuntimeId::OpenCode
        );
        assert_eq!(for_id(RuntimeId::Amp).unwrap().id(), RuntimeId::Amp);
        assert_eq!(
            for_id(RuntimeId::NpmPackage).unwrap().id(),
            RuntimeId::NpmPackage
        );
        assert_eq!(
            for_id(RuntimeId::Portable).unwrap().id(),
            RuntimeId::Portable
        );
        assert_eq!(
            for_id(RuntimeId::GithubCopilot).unwrap().id(),
            RuntimeId::GithubCopilot
        );
    }

    #[test]
    fn command_renderer_for_covers_exactly_the_verified_four() {
        for id in [
            RuntimeId::ClaudeCode,
            RuntimeId::CodexCli,
            RuntimeId::OpenCode,
            RuntimeId::GithubCopilot,
        ] {
            let renderer = command_renderer_for(id).expect("{id:?} renders commands");
            assert_eq!(renderer.id(), id);
        }
        for id in [
            RuntimeId::Antigravity,
            RuntimeId::Amp,
            RuntimeId::NpmPackage,
            RuntimeId::Portable,
            RuntimeId::Pi,
        ] {
            assert!(
                command_renderer_for(id).is_none(),
                "{id:?} has no command format documented"
            );
        }
    }

    /// The path `Option`s and the capability impls have to agree: a runtime
    /// with a hooks file but no `HookCapability` would advertise a location
    /// nothing writes to, and one with a renderer and no path would have
    /// nowhere to put its output.
    #[test]
    fn hook_and_mcp_renderers_track_the_path_options() {
        for id in RuntimeId::ALL.iter().copied() {
            let paths = for_id(id).expect("every id resolves").paths().clone();
            assert_eq!(
                hook_renderer_for(id).is_some(),
                paths.hooks_file.is_some(),
                "{id:?}: HookCapability and RuntimePaths::hooks_file disagree"
            );
            assert_eq!(
                mcp_renderer_for(id).is_some(),
                paths.mcp_config_file.is_some(),
                "{id:?}: McpCapability and RuntimePaths::mcp_config_file disagree"
            );
        }
    }

    #[test]
    fn script_renderer_covers_everything_but_the_skill_and_command_only_targets() {
        for id in RuntimeId::ALL.iter().copied() {
            let expected = !matches!(
                id,
                RuntimeId::Portable
                    | RuntimeId::GithubCopilot
                    | RuntimeId::Cursor
                    | RuntimeId::Pi
                    | RuntimeId::Antigravity
            );
            assert_eq!(
                script_renderer_for(id).is_some(),
                expected,
                "{id:?} script renderer"
            );
        }
    }

    #[test]
    fn github_copilot_is_command_only() {
        // The one built-in with no skill or agent renderer at all, so it is
        // absent from `all()` — see that function's own doc.
        assert!(skill_renderer_for(RuntimeId::GithubCopilot).is_none());
        assert!(agent_renderer_for(RuntimeId::GithubCopilot).is_none());
        assert!(command_renderer_for(RuntimeId::GithubCopilot).is_some());
        assert!(
            all()
                .iter()
                .all(|runtime| runtime.id() != RuntimeId::GithubCopilot)
        );
    }
}
