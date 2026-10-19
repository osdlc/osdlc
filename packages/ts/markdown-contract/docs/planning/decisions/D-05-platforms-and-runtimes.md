---
id: D-05
type: decision
state: accepted
created: 2026-10-18
---

# D-05: Platforms and runtimes

## Decision

- Node.js is the base target. `engines.node` is `>=22`.
- The package is ESM only and ships compiled JavaScript and `.d.ts` files
  under `dist/`. It has no CommonJS build.
- `@osdlc/markdown-contract/core` imports no Node module, so it can go in a
  browser bundle. A test walks the built import graph and fails on a Node
  import. No test runs it in a browser, so the package does not claim a
  tested browser runtime.
- The folder runner, the YAML loaders and the command need Node. The root
  entry includes the folder runner, so browser code imports `./core`.
- Linux and macOS are supported and tested in CI. Windows is expected to work
  but is untested.

## Why

- Node refuses to run `.ts` files under `node_modules`, so the package ships
  JavaScript.
- Splitting `./core` from the rest gives browser and edge code an
  entry with no Node imports, without a second package.
- Node 22 is the oldest supported LTS line.
- A claim for a platform or runtime needs a test that runs on it. Windows and
  browsers have none yet.

## Consequences

- Dropping Node 22 is a breaking change.
- Adding a Node import to `./core` fails the import-graph test.
