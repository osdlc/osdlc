---
id: D-01
type: decision
state: proposed
created: 2026-11-13
---

# D-01: One core, four surfaces

Proposed. It waits for the owner's sign-off.

## Decision

- The package has one core: pure functions over a `LoadedCorpus`, the data `loadCorpus` of
  `@osdlc/corpus-schema` returns. The TypeScript API, the `corpus-query` command, the REST server
  and the MCP server all call it and add nothing to what a query means.
- The main entry, `@osdlc/corpus-query`, is the core. It imports only types from
  `@osdlc/corpus-schema`, so it loads no `node:` module. A test walks its imports and fails on
  one that is not a type import.
- What needs Node or another package is a subpath: `./node` (find and load a corpus, serve on
  `node:http`), `./rest` (the REST handler, web-standard), `./mcp` (needs
  `@modelcontextprotocol/sdk`) and `./cli` (needs `@osdlc/cli-tool`).
- The core parses no corpus file. It reads the model and keeps its own lookups in a `WeakMap`
  beside it.

## Why

- A corpus is often published as a small site with its data. The site can load the corpus at
  build time, ship it as JSON, and run the same queries in the browser. That only works when the
  core runs without Node.
- The docs site aliases `@osdlc/<name>` to `src/index.ts`, so the main entry is the one a guide
  page can import. That is where the browser-safe code has to be.
- `@osdlc/corpus-schema`'s own lookups (`getRecord`, `recordsOf`) are exported from an entry
  that loads `node:fs`. Importing them would pull Node into the core. The core has its own
  small index instead, and compares ids the way `fold` does.

## Consequences

- If `@osdlc/corpus-schema` grows a browser-safe entry for its model helpers, the core can use
  it and drop its own index.
- `@modelcontextprotocol/sdk`, `@osdlc/cli-tool` and `zod` are plain dependencies, so
  `npx @osdlc/corpus-query mcp` works with no other install. A consumer that imports only the
  core still installs them. Making them optional peers is open until someone needs it.
