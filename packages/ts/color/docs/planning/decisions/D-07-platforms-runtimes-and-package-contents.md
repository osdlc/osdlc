---
id: D-07
type: decision
state: accepted
created: 2026-10-18
---

# D-07: Platforms, runtimes and package contents

## Decision

- Node.js is the base target. `engines.node` is `>=22`, the oldest supported
  LTS line.
- The code uses standard ES2022 only, with no imports and no DOM. It runs on
  any operating system. It is tested on Linux and macOS.
- The package ships compiled ESM and `.d.ts` files only, under `dist/`. It
  does not ship its TypeScript source, and `exports` has no `bun` condition.
  There is no CommonJS build.
- Tests run on Vitest under Node: CI runs the unit tests on Node 22 and 24,
  the smoke check against the built package, and the clean-consumer check on
  the packed tarball.
- Another runtime, such as Bun, Deno or a browser, is claimed only once a
  test runs on it.

## Why

- Node refuses to run `.ts` files under `node_modules`, so a package must
  ship JavaScript.
- One artifact for every runtime. Compiled JavaScript works everywhere and
  needs nothing from the consumer.
- The code is pure arithmetic, so it has no platform-specific path. Testing on
  two operating systems still guards the build and the packaging.
- Node 20 is past end of life.

## Consequences

- In this repository, `tsconfig.json` and `vitest.config.ts` map the
  package's own name to `index.ts`, so the examples and the README blocks run
  before a build.
- Dropping Node 22 is a breaking change, made in a major release.
