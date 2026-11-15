---
id: D-03
type: decision
state: proposed
created: 2026-11-13
---

# D-03: MCP and REST on their own servers

Proposed. It waits for the owner's sign-off.

## Decision

- The `corpus-query` command is an `@osdlc/cli-tool` command tree: `defineApp`, with `--json`,
  `--output jsonl`, `help`, `schema` and the shared exit codes.
- The MCP server is built on `@modelcontextprotocol/sdk`'s low-level `Server`, the class
  `@osdlc/cli-tool/mcp` uses, but not on that adapter.
- The REST server is a fetch-style handler of its own, served on `node:http`, not
  `@osdlc/cli-tool/http`.

## Why not the cli-tool adapters

`@osdlc/cli-tool/mcp` turns each command into a tool whose input is the command's flags. That is
right for a tool whose commands are its API. Here it does not fit:

- A flag is a string, a list of strings or a boolean. A `limit` would be the string `"20"`, and
  `where` could not take a `{ field, op, value }` object. The brief is one JSON query passed
  through unchanged.
- The tool list would be the command list: `find`, `type`, `refs`. An agent needs names that
  say what they do without the command's help: `find_records`, `describe_type`.
- An agent needs smaller answers than a person: 20 records, a body cut at 8000 characters, 20
  backlinks. Those defaults differ from the command's.
- The adapter has no resources.

`@osdlc/cli-tool/http` runs commands by `POST /commands/<name>` with a token made for the run. It
is for a tool's own local page. This API is read-only `GET` routes that a browser, `curl` and
another runtime can call, with an optional CORS header.

## Consequences

- The MCP tool schemas and the OpenAPI description are written by hand, in `src/openapi.ts` and
  `src/mcp.ts`. A new query key has to be added there too. A test would catch a tool that
  refuses a key the core takes; none does yet.
- The REST server has no token. It binds 127.0.0.1 by default and refuses a `Host` header that
  names another host. Serving a private corpus on a network needs something in front of it.
- `corpus-query serve --mcp` mounts MCP over streamable HTTP at `/mcp`, with no session, through
  the SDK's web-standard transport.
