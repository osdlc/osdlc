---
id: D-03
type: decision
state: accepted
created: 2026-10-13
---

# D-03: Platforms and runtimes

## Decision

- POSIX only (Linux and macOS) for the first `0.x` releases. Windows support
  comes before `1.0`, if that is feasible ([T-01](../tasks/T-01-windows-support.md)).
- Node.js 22 or later (`engines.node` is `>=22`). Node is the primary runtime.
- ESM only. There is no CommonJS build.
- Bun works, through the compiled `dist/`. `exports` has no `bun` condition and
  the tarball ships no TypeScript source.

## Why

- Windows needs a different shell, a different way to kill a process tree and
  a lookup for `.cmd` shims. That is real work, and it should not hold back
  the first release.
- Node 20 is past end of life. Node 22 and 24 are the supported lines.
- The library uses nothing newer than Node 18. The floor is about what is
  supported, not a code limit.
- One artifact for every runtime. A `bun` condition would run the source under
  Bun while Node runs `dist/`, so a Bun user could run code the Node tests
  never saw. Workspace packages resolve each other through `dist/`, built
  first.

## Consequences

- The README states POSIX only and Node 22, as the facts today rather than a
  promise of support.
- CI builds the package, runs the smoke check and checks the tarball on Node
  22 and on Node 24. The test suite runs on Vitest under Node
  ([T-02](../tasks/T-02-vitest.md)).
- CommonJS users on Node 22.12 or later can `require()` the package. On Node
  22.0 to 22.11 they need `await import()`.
- Every runtime loads the build, so a build bug shows for all of them. The
  tarball check loads every entry point under Node to catch that.
- The tarball ships `dist/` and no `.ts` source files.
