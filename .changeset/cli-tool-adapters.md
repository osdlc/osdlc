---
"@osdlc/cli-tool": minor
---

A command tree can now be served to an agent over MCP and to a local page over HTTP, and lists print as JSON lines.

- `--output text|json|jsonl` on every command. `--output json` is `--json`. A command that declares `items: { field, kind }` prints one JSON line per element of that list under `jsonl`, each with `schemaVersion` and `kind`.
- A long-running command declares `events` and sends them with `ctx.emit`. They print as they happen, stream over HTTP and go to MCP clients as progress. `ctx.signal` is aborted when the caller cancels. `CliContext` takes an optional `signal`.
- Commands declare `destructive`, and `exposure: 'cli-only'` (or `exposureOf(input)` per call) for commands the adapters must not run. The shared `trust` command makes granting trust `cli-only`. `ConfigStore.cliOnlyKeys` does the same for `config set` and `config unset` of trust keys.
- `App.call(path, args, ctx, options)` runs a data command from a JSON object of its flags and positionals and enforces exposure. `App.argsSchema(path)` is the JSON Schema of that object. `schema` entries now carry `description`, `readOnly`, `destructive`, `exposure`, `items` and `events`.
- New entry `@osdlc/cli-tool/mcp`: `mcpCommand()` (mount it as `mcp`), `serveMcp`, `createMcpServer`, `mcpTools`, `toolName`. It needs `@modelcontextprotocol/sdk` 1.32 or later, an optional peer dependency; no other entry loads it.
- New entry `@osdlc/cli-tool/http`: `httpApiCommand()` (mount it as `serve-api`), `createHttpApi` for a handler an app mounts under a prefix beside its own page, and `serveHttp`. It binds 127.0.0.1, checks `Host` and `Origin`, requires a bearer token, and reads a body only after those checks. A mount may run named `cli-only` commands behind a one-time confirmation nonce.
- `config explain <key>`, when the store has an `explain` method: each layer's value, which one won and why, including a layer that may not set the key.

To update: a command may no longer declare a flag named `output`; the app provides it. `ctx.app` is now the `App` (it still has `name` and `version`). Code that builds a `CommandContext` by hand must add `output`, `surface`, `signal` and `emit`. Help lists `--output` under every command, so a test that compares help text needs the new line.
