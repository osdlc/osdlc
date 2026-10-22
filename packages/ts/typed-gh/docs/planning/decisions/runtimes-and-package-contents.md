---
type: decision
state: accepted
created: 2026-10-20
---

# Runtimes and package contents

## Decision

- Node `^22.22.2 || ^24.15.0 || >=26.0.0` (`engines.node`), the range of
  `@osdlc/typed-git`. Node is the primary runtime.
- ESM only. There is no CommonJS build.
- Bun works, through the compiled `dist/`. `exports` has no `bun` condition.
- The tarball ships `dist/` and no `.ts` source files.
- macOS and Linux only for now. Windows waits for a Windows CI job.

## Why

- Node 20 is past end of life. Node 22 and 24 are the supported lines.
- One artifact for every runtime. A `bun` condition would run the source under
  Bun while Node runs `dist/`, so a Bun user could run code the Node tests
  never saw.
- A package's `engines.node` is no wider than any workspace dependency's.
  `@osdlc/command-seam` declares `>=22`. `@osdlc/typed-git` declares
  `^22.22.2 || ^24.15.0 || >=26.0.0`, because its dependency `hosted-git-info`
  10.1.1 does. This package depends on `@osdlc/typed-git`, so it declares the
  same range. `package-shape-ts.ts` enforces the rule. (An earlier version of
  this record kept `>=22` and left the warning to the package manager.)

## Consequences

- The README gives the Node range above, and says macOS and Linux only.
- `pnpm run smoke` runs the built package under Node, to catch a broken emit.
  CI runs the same check on the packed tarball.
- Every runtime loads the build, so the workspace builds first, then
  typechecks and tests. The tests run on Vitest under Node.
