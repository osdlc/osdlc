//! Runtime trait hierarchy: [`CodingAgentRuntime`] as the base, and one
//! peer sub-trait per capability ([`SkillCapability`], [`AgentCapability`],
//! [`HookCapability`], [`ScriptCapability`]).
//!
//! MCP support is another peer capability in [`crate::mcp::McpCapability`]
//! with the same shape, deliberately not privileged in this module.
//!
//! Not every runtime supports every asset type — `npm_package` has no hooks,
//! some runtimes handle MCP differently. Per-capability traits let a runtime
//! express exactly what it supports, and let composition functions bound
//! themselves on only the capabilities they actually use.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{Agent, Command, ExportedFile, Hook, Result, Script, Skill};

/// Closed enum of every runtime the crate knows about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[non_exhaustive]
pub enum RuntimeId {
    /// Anthropic's Claude Code CLI.
    ClaudeCode,
    /// Google's Antigravity CLI (`agy`), the successor to Gemini CLI.
    Antigravity,
    /// OpenAI's Codex CLI.
    CodexCli,
    /// SST's OpenCode.
    OpenCode,
    /// Sourcegraph's Amp.
    Amp,
    /// Cursor. Skill-only in this crate today — see
    /// [`crate::runtimes::cursor`] for what it deliberately does not render.
    Cursor,
    /// GitHub Copilot's prompt files (`.github/prompts/`). Command-only in
    /// this crate today — see [`crate::runtimes::copilot`] for why no
    /// [`SkillCapability`] or [`AgentCapability`] impl exists yet.
    GithubCopilot,
    /// Generic npm package layout.
    NpmPackage,
    /// No product — the Agent Skills standard itself, rendered for
    /// whichever client reads the shared `.agents/` convention. See
    /// [`crate::runtimes::portable`].
    Portable,
    /// Pi (`earendil-works/pi`). Skill-only — see [`crate::runtimes::pi`].
    Pi,
}

impl RuntimeId {
    /// Every variant, in declaration order.
    ///
    /// The enum is closed, but Rust has no reflection over it, so any
    /// caller that needs "every runtime, whatever it can render" —
    /// [`crate::capabilities::all_declarations`] is the first — would otherwise retype
    /// the list. The exhaustive `match` in this module's
    /// `every_variant_is_in_all` test is the compile-time guard: a new
    /// variant fails to compile there until it is added here too.
    pub const ALL: &'static [RuntimeId] = &[
        RuntimeId::ClaudeCode,
        RuntimeId::Antigravity,
        RuntimeId::CodexCli,
        RuntimeId::OpenCode,
        RuntimeId::Amp,
        RuntimeId::Cursor,
        RuntimeId::GithubCopilot,
        RuntimeId::NpmPackage,
        RuntimeId::Portable,
        RuntimeId::Pi,
    ];

    /// The destination spelling of this runtime — the name a publish
    /// target, a `ap-targets` entry, or a matrix column is keyed by.
    ///
    /// Deliberately **not** the serde rename: `#[serde(rename_all =
    /// "kebab-case")]` spells [`RuntimeId::OpenCode`] `open-code`, while
    /// every destination vocabulary in the ecosystem spells it `opencode`.
    /// This is the destination spelling, so a caller keying a column by it
    /// keys it the way the harnesses do.
    pub fn as_str(self) -> &'static str {
        match self {
            RuntimeId::ClaudeCode => "claude-code",
            RuntimeId::Antigravity => "antigravity",
            RuntimeId::CodexCli => "codex-cli",
            RuntimeId::OpenCode => "opencode",
            RuntimeId::Amp => "amp",
            RuntimeId::Cursor => "cursor",
            RuntimeId::GithubCopilot => "github-copilot",
            RuntimeId::NpmPackage => "npm-package",
            RuntimeId::Portable => "portable",
            RuntimeId::Pi => "pi",
        }
    }
}

/// The complete set of frontmatter keys the Agent Skills specification
/// defines, in this crate's canonical snake_case spelling.
///
/// The specification carries no version number, so this list is pinned to
/// a reading of <https://agentskills.io/specification> on 2026-08-09 and
/// to the reference validator's `ALLOWED_FIELDS`
/// (`skills-ref/src/skills_ref/validator.py`), which is the only place the
/// closed-set rule is actually written down: a key outside this set is a
/// hard error for `agentskills validate`, for claude.ai upload, and for
/// the Skills API.
///
/// All six are modelled on [`crate::Skill`], and no dialect omits any of
/// them: [`FrontmatterDialect::omit_fields`] says what one *target* does
/// not understand, and these are the specification's own keys rather than
/// a harness's.
pub const AGENT_SKILLS_FIELDS: &[&str] = &[
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed_tools",
];

/// The frontmatter keys this crate renders that the Agent Skills
/// specification does not define — every one of them outside
/// [`AGENT_SKILLS_FIELDS`].
///
/// Defined by what it is not, rather than by whose keys these are. Claude
/// Code is where this crate first read all six and its dialect keeps them
/// all, but the set belongs to no single target: Cursor and Pi both read
/// `disable_model_invocation` under that exact spelling and that exact
/// meaning, so their dialects keep that one and omit the rest. Every other
/// dialect lists the whole set in [`FrontmatterDialect::omit_fields`],
/// because emitting a key from here produces frontmatter a validating
/// client rejects outright — Claude Code's own documentation prints
/// `argument-hint`, a key on this list, inside the hard-error message.
///
/// A dialect that keeps only part of this set spells its own omit list, so
/// adding a key here would silently start emitting it there. Each such
/// dialect pins the partition with a test — see
/// `omit_list_partitions_the_extension_fields` in `runtimes::cursor` and
/// `runtimes::pi`.
pub const AGENT_SKILLS_EXTENSION_FIELDS: &[&str] = &[
    "argument_hint",
    "arguments",
    "model",
    "context",
    "user_invocable",
    "disable_model_invocation",
];

/// Project scope vs user scope for path resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    /// Paths relative to a project root.
    Project,
    /// Paths relative to the user's home directory.
    User,
}

/// A path that differs between project scope and user scope.
///
/// Runtimes that use the same directory layout in both scopes (most of
/// them) store the same [`PathBuf`] in both fields. Runtimes that don't
/// (or that only support one scope) can still represent it with
/// distinct values.
#[derive(Debug, Clone, PartialEq)]
pub struct ScopedRelative {
    /// Path relative to a project root (e.g. `.claude/skills`).
    pub project: PathBuf,
    /// Path relative to a user's home directory (e.g. `.claude/skills`).
    pub user: PathBuf,
}

impl ScopedRelative {
    /// Construct a [`ScopedRelative`] where the same path is used for
    /// both scopes — the common case.
    pub fn same(path: impl Into<PathBuf>) -> Self {
        let p = path.into();
        Self {
            project: p.clone(),
            user: p,
        }
    }

    /// Return the path that applies to the given scope.
    pub fn for_scope(&self, scope: Scope) -> &PathBuf {
        match scope {
            Scope::Project => &self.project,
            Scope::User => &self.user,
        }
    }
}

/// Per-asset path conventions for a runtime.
///
/// Each field is either a [`ScopedRelative`] (for asset types the
/// runtime supports) or `None` (for ones it doesn't — e.g. the
/// `NpmPackage` runtime has no hooks or MCP config).
///
/// Paths are **relative** — either to a project root (for
/// [`Scope::Project`]) or to a user home directory (for [`Scope::User`]).
/// Anchoring them against an absolute root is the install layer's job.
///
/// Note that asset types do not share a common prefix: Codex CLI, for
/// example, stores skills under `.agents/skills/` (the Anthropic Agent
/// Skills shared convention) but its MCP config under `.codex/config.toml`.
/// Representing every path explicitly removes that ambiguity.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub struct RuntimePaths {
    /// Directory where [`Skill`]s are installed.
    pub skills_dir: ScopedRelative,
    /// Directory where [`Agent`] personas are installed.
    pub agents_dir: ScopedRelative,
    /// Directory where [`crate::Command`]s are installed, if this runtime has
    /// slash commands at all.
    ///
    /// `Option` because command support is genuinely uneven: Claude Code and
    /// Cursor read markdown under `commands/`, and the rest define nothing
    /// (Antigravity converts commands to skills). A runtime that cannot say
    /// where a command goes says `None` rather than being given a plausible path — a
    /// guessed directory is a file the harness never loads and the author
    /// never finds.
    pub commands_dir: Option<ScopedRelative>,
    /// Directory where [`Script`]s are installed.
    pub scripts_dir: ScopedRelative,
    /// Hooks configuration file, if this runtime has one.
    pub hooks_file: Option<ScopedRelative>,
    /// MCP servers configuration file, if this runtime has one.
    pub mcp_config_file: Option<ScopedRelative>,
}

impl RuntimePaths {
    /// Paths for a runtime with skills, agents and scripts, and no commands,
    /// hooks file or MCP config. Set those fields afterwards when the runtime
    /// has them.
    pub fn new(
        skills_dir: ScopedRelative,
        agents_dir: ScopedRelative,
        scripts_dir: ScopedRelative,
    ) -> Self {
        Self {
            skills_dir,
            agents_dir,
            commands_dir: None,
            scripts_dir,
            hooks_file: None,
            mcp_config_file: None,
        }
    }

    /// Resolved skills directory, anchored against `anchor`.
    pub fn skills_dir_for(&self, anchor: &Path, scope: Scope) -> PathBuf {
        anchor.join(self.skills_dir.for_scope(scope))
    }

    /// Resolved agents directory, anchored against `anchor`.
    pub fn agents_dir_for(&self, anchor: &Path, scope: Scope) -> PathBuf {
        anchor.join(self.agents_dir.for_scope(scope))
    }

    /// Resolved commands directory, if this runtime has one.
    pub fn commands_dir_for(&self, anchor: &Path, scope: Scope) -> Option<PathBuf> {
        self.commands_dir
            .as_ref()
            .map(|dir| anchor.join(dir.for_scope(scope)))
    }

    /// Resolved scripts directory, anchored against `anchor`.
    pub fn scripts_dir_for(&self, anchor: &Path, scope: Scope) -> PathBuf {
        anchor.join(self.scripts_dir.for_scope(scope))
    }

    /// Resolved hooks file path, if this runtime has one.
    pub fn hooks_path_for(&self, anchor: &Path, scope: Scope) -> Option<PathBuf> {
        self.hooks_file
            .as_ref()
            .map(|sr| anchor.join(sr.for_scope(scope)))
    }

    /// Resolved MCP config file path, if this runtime has one.
    pub fn mcp_config_path_for(&self, anchor: &Path, scope: Scope) -> Option<PathBuf> {
        self.mcp_config_file
            .as_ref()
            .map(|sr| anchor.join(sr.for_scope(scope)))
    }
}

/// Casing convention for YAML frontmatter field names.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldNaming {
    /// `allowed-tools`, `user-invocable`, etc.
    Kebab,
    /// `allowed_tools`, `user_invocable`, etc.
    Snake,
}

/// Per-runtime YAML frontmatter quirks.
///
/// `omit_fields` is how a target says "this key is not part of my
/// contract". It is the whole mechanism behind the portable projection:
/// every dialect but Claude Code's lists
/// [`AGENT_SKILLS_EXTENSION_FIELDS`] there, so the superset reaches the one
/// runtime that documents it and no other.
#[derive(Debug, Clone, PartialEq)]
pub struct FrontmatterDialect {
    /// Whether field names are kebab-case or snake_case.
    pub field_naming: FieldNaming,
    /// Canonical (snake_case) field names that should be unconditionally
    /// omitted from the rendered frontmatter.
    ///
    /// Applies to every frontmatter this dialect renders — skills and
    /// agent personas alike — so a runtime that omits `model` omits it
    /// from both. That is deliberate: the list says what the *target*
    /// understands, not what one file type happens to carry.
    ///
    /// **A per-target override outranks it.** See
    /// [`crate::render::FrontmatterBuilder::apply_overrides`] for why: an
    /// `ap-overrides` key names one harness's own field, so a key this list
    /// omits is refused before a render begins rather than merged past it.
    pub omit_fields: &'static [&'static str],
    /// If `true`, emit `user-invocable: true` explicitly rather than
    /// relying on the spec default.
    pub emit_user_invocable_default: bool,
}

/// The base runtime trait.
///
/// `Send + Sync` because runtime impls are typically zero-sized unit
/// structs passed around freely.
pub trait CodingAgentRuntime: Send + Sync {
    /// Stable machine identifier for this runtime.
    fn id(&self) -> RuntimeId;

    /// Human-readable display name.
    fn display_name(&self) -> &'static str;

    /// Path conventions.
    fn paths(&self) -> &RuntimePaths;

    /// YAML frontmatter dialect.
    fn frontmatter_dialect(&self) -> &FrontmatterDialect;
}

/// Runtimes that can render [`Skill`]s.
pub trait SkillCapability: CodingAgentRuntime {
    /// Render a single skill to one or more virtual files.
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>>;
}

/// Runtimes that can render agent personas.
pub trait AgentCapability: CodingAgentRuntime {
    /// Render a single agent persona to one or more virtual files.
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>>;
}

/// Runtimes that can render slash commands.
pub trait CommandCapability: CodingAgentRuntime {
    /// Render a single command to one or more virtual files.
    fn render_command(&self, command: &Command) -> Result<Vec<ExportedFile>>;
}

/// Runtimes that can render hooks.
///
/// Hooks are rendered collectively because most runtimes serialize all
/// hooks into a single config file (e.g. `hooks.json`).
///
/// Event names are translated, and an event this runtime does not carry is
/// refused by name, inside the render — see
/// [`crate::capabilities::hook_event_spelling`], which reads this runtime's
/// own [`crate::capabilities::DeclaresCapabilities`] answer rather than a
/// second table. Implementing this trait therefore does not mean every hook
/// renders: it means there is a file to write when one does.
pub trait HookCapability: CodingAgentRuntime {
    /// Render a collection of hooks to one or more virtual files.
    ///
    /// # Errors
    ///
    /// [`crate::Error::Validation`] where this runtime carries no such hook
    /// event. Nothing partial is written.
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>>;
}

/// Runtimes that can render standalone scripts.
pub trait ScriptCapability: CodingAgentRuntime {
    /// Render a single script (shebang + body) to a virtual file.
    fn render_script(&self, script: &Script) -> Result<ExportedFile>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_paths() -> RuntimePaths {
        RuntimePaths {
            skills_dir: ScopedRelative::same(".claude/skills"),
            agents_dir: ScopedRelative::same(".claude/agents"),
            commands_dir: None,
            scripts_dir: ScopedRelative::same(".claude/scripts"),
            hooks_file: Some(ScopedRelative::same(".claude/hooks.json")),
            mcp_config_file: Some(ScopedRelative::same(".mcp.json")),
        }
    }

    #[test]
    fn project_scope_anchors_under_project_root() {
        let p = sample_paths();
        let anchor = Path::new("/tmp/proj");
        assert_eq!(
            p.skills_dir_for(anchor, Scope::Project),
            PathBuf::from("/tmp/proj/.claude/skills")
        );
        assert_eq!(
            p.hooks_path_for(anchor, Scope::Project),
            Some(PathBuf::from("/tmp/proj/.claude/hooks.json"))
        );
        assert_eq!(
            p.mcp_config_path_for(anchor, Scope::Project),
            Some(PathBuf::from("/tmp/proj/.mcp.json"))
        );
    }

    #[test]
    fn scoped_relative_distinct_project_and_user() {
        let sr = ScopedRelative {
            project: ".claude/skills".into(),
            user: ".config/claude/skills".into(),
        };
        assert_eq!(
            sr.for_scope(Scope::Project),
            &PathBuf::from(".claude/skills")
        );
        assert_eq!(
            sr.for_scope(Scope::User),
            &PathBuf::from(".config/claude/skills")
        );
    }

    /// The compile-time guard behind [`RuntimeId::ALL`]: the `match` below
    /// is exhaustive, so a new variant fails to compile here until someone
    /// gives it an arm, and the arm's assertion then fails until the
    /// variant is added to `ALL`.
    #[test]
    fn every_variant_is_in_all() {
        for id in [
            RuntimeId::ClaudeCode,
            RuntimeId::Antigravity,
            RuntimeId::CodexCli,
            RuntimeId::OpenCode,
            RuntimeId::Amp,
            RuntimeId::Cursor,
            RuntimeId::GithubCopilot,
            RuntimeId::NpmPackage,
            RuntimeId::Portable,
            RuntimeId::Pi,
        ] {
            // Exhaustive on purpose. Adding a variant breaks this line.
            match id {
                RuntimeId::ClaudeCode
                | RuntimeId::Antigravity
                | RuntimeId::CodexCli
                | RuntimeId::OpenCode
                | RuntimeId::Amp
                | RuntimeId::Cursor
                | RuntimeId::GithubCopilot
                | RuntimeId::NpmPackage
                | RuntimeId::Portable
                | RuntimeId::Pi => {}
            }
            assert!(RuntimeId::ALL.contains(&id), "{id:?} is missing from ALL");
        }
        assert_eq!(RuntimeId::ALL.len(), 10);
    }

    #[test]
    fn as_str_is_the_destination_spelling() {
        assert_eq!(RuntimeId::OpenCode.as_str(), "opencode");
        assert_eq!(RuntimeId::GithubCopilot.as_str(), "github-copilot");
        // Distinct across the enum, so a column key names one runtime.
        let mut names: Vec<&str> = RuntimeId::ALL.iter().map(|id| id.as_str()).collect();
        names.sort_unstable();
        let count = names.len();
        names.dedup();
        assert_eq!(names.len(), count);
    }

    #[test]
    fn missing_optional_paths_return_none() {
        let p = RuntimePaths {
            skills_dir: ScopedRelative::same(".foo/skills"),
            agents_dir: ScopedRelative::same(".foo/agents"),
            commands_dir: None,
            scripts_dir: ScopedRelative::same(".foo/scripts"),
            hooks_file: None,
            mcp_config_file: None,
        };
        assert!(p.hooks_path_for(Path::new("/"), Scope::Project).is_none());
        assert!(
            p.mcp_config_path_for(Path::new("/"), Scope::Project)
                .is_none()
        );
    }
}
