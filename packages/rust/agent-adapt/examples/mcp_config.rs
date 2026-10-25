//! Renders one MCP server into the config format of Claude Code, Codex CLI
//! and Antigravity, and prints each config.
//!
//! Run it with `cargo run --example mcp_config`.

use agent_adapt::McpServer;
use agent_adapt::mcp::render::{render_antigravity_json, render_claude_json, render_codex_toml};

fn main() {
    let server = McpServer::stdio("notes", "notes-mcp", ["--stdio"]);
    println!("Claude Code (.mcp.json):");
    println!("{}", render_claude_json(&server).expect("renders"));
    println!("Codex CLI (.codex/config.toml):");
    println!("{}", render_codex_toml(&server).expect("renders"));
    println!("Antigravity (.agents/mcp_config.json):");
    println!("{}", render_antigravity_json(&server).expect("renders"));
}
