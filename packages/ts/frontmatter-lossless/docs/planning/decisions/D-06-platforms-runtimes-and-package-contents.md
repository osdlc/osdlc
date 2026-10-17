---
id: D-06
type: decision
state: accepted
created: 2026-10-17
---

# D-06: Platforms, runtimes and package contents

## Decision

- Node.js is the base target. `engines.node` is `>=22`, the oldest supported
  LTS line.
- The code uses standard ES2022 only, with no imports. It runs on any
  operating system. It is tested on Linux and macOS.
- The package ships compiled ESM and `.d.ts` files only, under `dist/`. It
  does not ship its TypeScript source, and `exports` has no `bun` condition.
  There is no CommonJS build.
- Tests run on Node: CI runs the conformance corpus and a smoke check against
  the built package on Node 22 and 24, and runs the clean-consumer check on
  the packed tarball. The unit tests also run under Bun.
- Another runtime, such as Deno or a browser, is claimed only once a test
  runs on it.

## Why

- One artifact for every runtime. With a `bun` condition, Bun would run the
  TypeScript source while Node runs `dist/`, so a Bun user could run code the
  Node tests never saw. Without the condition, shipping the source would only
  add files nobody loads. Compiled JavaScript works in every runtime and
  needs nothing from the consumer.
- The code is pure string handling, so it has no platform-specific path.
  Testing on two operating systems still guards the build and the packaging.
- Node 20 is past end of life.

## Consequences

- In this repository, `tsconfig.json` maps the package's own name to
  `index.ts`, so the examples and the README blocks run under Bun before a
  build. The Node tests need `pnpm run build` first.
- Dropping Node 22 is a breaking change, made in a major release.
