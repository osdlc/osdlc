# Harness model — a canonical, host-neutral read of the surface

The **harness model** is a canonical, host-neutral description of an agentic
harness, derived from sdlc's live Claude Code surface. See
[[D-MDHQ-typescript-detect-harness-owns-harness-detection]] and
[[C-HRNS-multi-harness-control-plane]]. Its per-host exporters (Claude, Codex,
Cursor, Gemini, portable JSON) and `sdlc harness export` were retired in
[[T-1NWG]] once the agent-pants vault build became sdlc's sole build path for
producing the plugin itself; `harness model` remains as a read-only
introspection op.

## Model shape

`@osdlc/detect-harness/model` (`packages/ts/detect-harness/model.ts` in `osdlc/osdlc`) — a plain,
JSON-serializable Zod shape.

| Field | Is |
|---|---|
| `metadata` | name, version, description, author, homepage |
| `capabilities[]` | `kind` (skill \| command), name, description, instructions, allowedTools, argumentHint, resources[], annotations |
| `hooks[]` | event, matcher, action (shell command) |
| `mcpServers[]` | name, transport (stdio \| http \| sse), command/args/env or url/headers |
| `permissions` | allow[], deny[], ask[] |
| `documents[]` | name, body (shared context / conventions) |

The model does not check markdown bodies. MCP `env` and `headers` values, and
the user part and query values of an MCP `url`, read `<redacted>` unless the
caller asks to keep them.

## Ops

| Command | Does |
|---|---|
| `sdlc harness model [--output json]` | Derive + emit the model from the running plugin (or `--root <dir>`). |

## Reading

`readPlugin(pluginRoot)` (from `@osdlc/detect-harness/model`) reads `skills/`, `commands/`,
`conventions/`, `hooks/hooks.json`, the manifest's `hooks` and `mcpServers`, and the harness config
in `.claude/settings.json`, `.claude/settings.local.json` and `.mcp.json`. Use it to introspect what
a built plugin actually carries — it is a read of the surface, not a second way to produce one.
