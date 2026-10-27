//! Model Context Protocol (MCP) support.
//!
//! MCP is one *peer capability* among several — runtimes that can install
//! MCP servers implement [`McpCapability`], just like
//! [`crate::SkillCapability`] or [`crate::HookCapability`]. Nothing in the
//! base runtime module privileges MCP.
//!
//! * [`McpServer`] / [`McpTransport`] — runtime-agnostic data model.
//! * [`McpCapability`] — the peer trait runtimes implement to render an
//!   MCP server registration into one or more [`crate::ExportedFile`]s.
//! * [`render`] — format-specific helpers ([`render::render_claude_json`],
//!   [`render::render_codex_toml`], [`render::render_antigravity_json`]) that
//!   runtime impls call from their [`McpCapability::render_mcp_server`]
//!   implementation.

pub mod render;

mod model;

pub use model::{McpServer, McpTransport};

use crate::{CodingAgentRuntime, ExportedFile, Result};

/// A runtime capability for emitting MCP server registrations.
///
/// Implementations return a virtual file (or files) representing the MCP
/// config for `server`. The exact format is runtime-specific — Claude
/// Code uses JSON, Codex uses TOML, Antigravity uses JSON with `serverUrl`.
/// Implementations produce standalone config files; merging into an
/// existing user-owned config is a future [`crate::install`] concern.
pub trait McpCapability: CodingAgentRuntime {
    /// Render an MCP server registration for this runtime.
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>>;
}
