use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// A single MCP server entry to be registered with a coding-agent runtime.
///
/// Runtime-agnostic — the same [`McpServer`] renders into Claude Code's
/// `.mcp.json`, Codex CLI's `.codex/config.toml`, or Antigravity's
/// `.agents/mcp_config.json` via the appropriate runtime's
/// [`crate::mcp::McpCapability`] impl.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct McpServer {
    /// Key under which this server is registered in the runtime's config
    /// (e.g. `"example"`).
    pub name: String,
    /// How the runtime connects to the server.
    pub transport: McpTransport,
}

impl McpServer {
    /// Convenience constructor for an HTTP-transport MCP server.
    pub fn http(name: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            transport: McpTransport::Http { url: url.into() },
        }
    }

    /// Convenience constructor for a stdio-transport MCP server with no
    /// environment variables. Use the enum variant directly to pass env vars.
    pub fn stdio(
        name: impl Into<String>,
        command: impl Into<String>,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        Self {
            name: name.into(),
            transport: McpTransport::Stdio {
                command: command.into(),
                args: args.into_iter().map(Into::into).collect(),
                env: BTreeMap::new(),
            },
        }
    }
}

/// Connection transport for an MCP server.
///
/// `#[non_exhaustive]` so new transports land without a breaking major bump.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[non_exhaustive]
pub enum McpTransport {
    /// Streamable HTTP transport: the runtime connects to a URL.
    Http {
        /// Target URL, e.g. `http://localhost:4243/mcp`.
        url: String,
    },
    /// Stdio transport: the runtime spawns a subprocess and communicates
    /// over its stdin/stdout.
    Stdio {
        /// Executable to spawn.
        command: String,
        /// Command-line arguments.
        #[serde(default)]
        args: Vec<String>,
        /// Environment variables to set in the spawned process. A sorted
        /// `BTreeMap` so rendered output is deterministic.
        #[serde(default)]
        env: BTreeMap<String, String>,
    },
}
