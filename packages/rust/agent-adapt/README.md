# agent-adapt

Author a coding-agent asset once — a skill, agent, hook, script, plugin, or MCP
server — and render it into each runtime's own on-disk format.

The crate is a **pure projection layer**: a host-neutral model in, a set of
files out. Writing them to disk is opt-in and lives in one module.

## Install

```sh
cargo add agent-adapt
```

## Layout

| Module | Holds |
|---|---|
| `model` | The assets: `Skill`, `SkillResource`, `Agent`, `Hook`, `Script`, `Role`, `Plugin`, `PluginBundle`, `Marketplace` |
| `runtime` | What a target *is*: `RuntimeId`, `Scope`, `RuntimePaths`, `FrontmatterDialect`, and the capability traits (`SkillCapability`, `AgentCapability`, `CommandCapability`, `HookCapability`, `ScriptCapability`) |
| `runtimes` | The targets themselves: `ClaudeCode`, `CodexCli`, `Antigravity`, `OpenCode`, `Amp`, `Cursor`, `Copilot`, `NpmPackage`, `Portable`, `Pi`, plus `all()`, `for_id()`, `skill_renderer_for()`, `agent_renderer_for()`, `command_renderer_for()` |
| `render` | Per-format writers — `SKILL.md`, `AGENT.md`, `hooks.json`, script bodies, plugin manifests, and a `FrontmatterBuilder` |
| `mcp` | `McpServer`, `McpTransport`, and the three config renderers (`render_claude_json`, `render_codex_toml`, `render_antigravity_json`) |
| `skill_call` | `RuntimeId::skill_call` — how each runtime spells a user's invocation of a skill |
| `tools` | `ToolRegistry` — canonical tool names and per-runtime translation |
| `naming` | Slugging and tool-name deduplication |
| `output` | `ExportedFile`, `ExportedFileType`, `ExportedTree` — what a render returns |
| `compose` | Whole-plugin rendering |
| `install` | The only module that touches the filesystem. Writes at project scope under a project root, or at user scope under the home directory |

## Quick start

```rust
use agent_adapt::{RuntimeId, Skill, runtimes};

let skill = Skill::new("review-diff", "Review a diff", "Review a diff for defects.");
let renderer = runtimes::skill_renderer_for(RuntimeId::ClaudeCode).unwrap();
let files = renderer.render_skill(&skill)?;
// `files` is a `Vec<ExportedFile>` — paths + bytes. Write it yourself, or use `install`.
```

More in [`examples/`](examples), each run with `cargo run --example <name>`:

- `render_skill`: one skill for Claude Code.
- `render_everywhere`: one skill for every runtime that supports skills.
- `mcp_config`: one MCP server in the Claude Code, Codex CLI and Antigravity config formats.
- `install_skill`: install a skill at project scope, in a temporary directory.

## Portable output vs the Claude Code superset

`AGENT_SKILLS_FIELDS` is the complete frontmatter vocabulary the Agent Skills
specification defines; anything outside it is a hard error on every path that
validates rather than loads (`agentskills validate`, claude.ai upload, the
Skills API). What this crate renders beyond it is the
`AGENT_SKILLS_EXTENSION_FIELDS` constant in `src/runtime.rs`.

`ClaudeCode` is the only target that emits the second list; every other dialect
names it in `FrontmatterDialect::omit_fields`. `Portable` renders the standard
itself — the `.agents/skills/` convention, spec fields only, canonical tool
names — so one skill can be published full-fidelity to Claude Code *and*
conformant everywhere else.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and are listed in the [changelog](CHANGELOG.md).

These items are experimental. They may change in a minor release:

- `Marketplace`. No manifest is rendered from it yet.
- `DiagnosticCode`. New codes will be added.

`Error`, `RuntimeId`, `RuntimePaths`, `Skill`, `Command`, `Hook` and
`RuntimeCapabilities` are `#[non_exhaustive]`. Build them with their
constructors (`Skill::new`, `Command::new`, `Hook::new`, `Hook::command`,
`RuntimePaths::new`, `RuntimeCapabilities::new`), and give a `match` on
`Error` or `RuntimeId` a `_` arm.

## Platforms

The crate is tested on Linux, macOS and Windows. The minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
