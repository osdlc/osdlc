---
id: D-04
type: decision
state: accepted
created: 2026-10-17
---

# D-04: Platforms, runtimes and package contents

## Decision

- Node.js 22 or later, and Bun. `engines.node` is `>=22`.
- The glue is built with `wasm-bindgen --target nodejs`. It reads the `.wasm`
  file with `fs` from beside itself, so the package does not load in a
  browser or through a bundler. The README says so. A browser or bundler
  build would be a second glue build with its own export condition, added in
  a minor release.
- The package ships compiled ESM and `.d.ts` files only, under `dist/`, with
  the glue and the `.wasm` under `dist/wasm/`. It does not ship its TypeScript
  source, and `exports` has no `bun` condition.
- Tests run on Node: CI runs the conformance corpus and a smoke check against
  the built package on Node 22 and 24, on Linux and macOS, and runs the
  clean-consumer check on the packed tarball. The unit tests also run under
  Bun.

## Why

- Both known consumers run on Node or Bun. A browser build is wanted, but it
  needs its own glue and tests, and it can come later without breaking
  anyone.
- One artifact for every runtime: with a `bun` condition, Bun would run the
  source while Node runs `dist/`.
- WebAssembly has no native code, so the package runs on any operating system
  Node runs on.

## Consequences

- In this repository, `tsconfig.json` maps the package's own name to
  `index.ts`, so the examples and the README blocks run under Bun before a
  build. The Node tests build first.
- Dropping Node 22 is a breaking change.
