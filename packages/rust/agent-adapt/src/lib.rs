//! Data model and runtime adapters for authoring coding-agent assets once
//! and exporting them to every major runtime.
//!
//! `agent-adapt` ships as a single crate with the following layers:
//!
//! * **Domain models** ([`Skill`], [`Agent`], [`Hook`], [`Script`],
//!   [`Role`], [`Plugin`], [`PluginBundle`], [`Marketplace`]) — pure
//!   authoring content.
//! * **Naming** ([`naming`]) — kebab-case slugging, skill-name clamping,
//!   and deduplication helpers.
//! * **Path containment** ([`paths`]) — the one sanctioned way to join a
//!   caller-supplied relative path onto a root, refusing anything that
//!   would escape it.
//! * **Virtual filesystem** ([`ExportedFile`], [`ExportedTree`]) — what
//!   capability rendering functions return. No I/O.
//! * **Runtime trait hierarchy** ([`CodingAgentRuntime`] plus peer
//!   capability traits [`SkillCapability`], [`AgentCapability`],
//!   [`HookCapability`], [`ScriptCapability`], [`mcp::McpCapability`]).
//! * **Tool vocabulary** ([`tools::ToolRegistry`]) — canonical tool names
//!   and per-runtime translation.
//! * **Shared rendering** ([`render`]) — YAML frontmatter builder,
//!   SKILL.md emitter, agent emitter, hooks JSON emitter, script body
//!   emitter, and plugin manifest builder. Every runtime adapter reuses
//!   these instead of duplicating serialization logic.
//! * **Runtimes** ([`runtimes`]) — concrete [`CodingAgentRuntime`]
//!   implementations for Claude Code, Antigravity, Codex CLI, OpenCode,
//!   Amp, Cursor, GitHub Copilot, Pi, generic npm packages, and the portable
//!   (standards-only) target.
//! * **Skill calls** ([`skill_call`]) — how each runtime spells a user's
//!   invocation of a skill (`/ns:name`, `$ns:name`, `/skill:name`).
//! * **Composition** ([`compose`]) — free functions that compose
//!   capability traits to render a whole [`PluginBundle`] at once.
//! * **Install helpers** ([`install`]) — concrete filesystem writers
//!   on top of [`ExportedTree`] plus per-capability install shortcuts.
//! * **MCP support** ([`mcp`]) — [`mcp::McpServer`] model, the
//!   [`mcp::McpCapability`] peer trait, and format-specific renderers.
//! * **Capability declarations** ([`capabilities`]) — every runtime says
//!   what it does with each asset type, frontmatter field, tool name,
//!   permission concept and hook event, with a source and a date on every
//!   claim the code cannot decide by itself.
//! * **Diagnostics** ([`diagnostic`]) — the one [`Diagnostic`] shape every
//!   read-time, render-time and publish-time problem reports through.
//!
//! # Portable output vs the Claude Code superset
//!
//! [`AGENT_SKILLS_FIELDS`] is the complete frontmatter vocabulary the
//! Agent Skills specification defines, and a client that *validates*
//! rather than loads treats anything outside it as a hard error.
//! [`AGENT_SKILLS_EXTENSION_FIELDS`] is what this crate renders beyond it.
//! Only [`runtimes::ClaudeCode`] emits that whole second list; Cursor and Pi
//! keep `disable-model-invocation` from it, every other dialect names it in
//! [`FrontmatterDialect::omit_fields`], and
//! [`runtimes::Portable`] exists so one skill can be rendered both ways —
//! full-fidelity for Claude Code, conformant for everything else.

pub mod capabilities;
pub mod compose;
pub mod diagnostic;
pub mod error;
pub mod install;
pub mod mcp;
pub mod model;
pub mod naming;
pub mod output;
pub mod paths;
pub mod render;
pub mod runtime;
pub mod runtimes;
pub mod skill_call;
pub mod tools;

pub use capabilities::{
    AssetKind, CapabilityMatrix, Claim, Concept, ConceptKind, DeclaresCapabilities, Evidence,
    MatrixRow, RuntimeCapabilities, Support,
};
pub use diagnostic::{Diagnostic, DiagnosticCode, DiagnosticScope, Severity};
pub use error::Error;
pub use mcp::{McpServer, McpTransport};
pub use model::{
    Agent, Argument, Command, Hook, HookType, Marketplace, Plugin, PluginBundle, Role, Script,
    ScriptLanguage, Skill, SkillResource,
};
pub use output::{ExportedFile, ExportedFileType, ExportedTree};
pub use runtime::{
    AGENT_SKILLS_EXTENSION_FIELDS, AGENT_SKILLS_FIELDS, AgentCapability, CodingAgentRuntime,
    CommandCapability, FieldNaming, FrontmatterDialect, HookCapability, RuntimeId, RuntimePaths,
    Scope, ScopedRelative, ScriptCapability, SkillCapability,
};
pub use skill_call::{SkillCallError, SkillCallSyntax};
pub use tools::{ToolEntry, ToolRegistry};

/// Convenience `Result` alias using the crate [`Error`].
pub type Result<T> = std::result::Result<T, Error>;
