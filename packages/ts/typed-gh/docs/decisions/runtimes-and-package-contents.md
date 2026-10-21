---
type: decision
state: accepted
created: 2026-10-20
---

# Runtimes and package contents

## Decision

- Node 22 or later (`engines.node` is `>=22`). Node is the primary runtime.
- ESM only. There is no CommonJS build.
- Bun works, through the compiled `dist/`. `exports` has no `bun` condition.
- The tarball ships `dist/` and no `.ts` source files.
- macOS and Linux only for now. Windows waits for a Windows CI job.

## Why

- Node 20 is past end of life. Node 22 and 24 are the supported lines.
- One artifact for every runtime. A `bun` condition would run the source under
  Bun while Node runs `dist/`, so a Bun user could run code the Node tests
  never saw.
- `@osdlc/typed-git` and `@osdlc/command-seam` use the same floor. This
  package declares `>=22`, as `@osdlc/command-seam` does. `@osdlc/typed-git`
  declares no `engines` field.
- A transitive dependency, `hosted-git-info` 10.1.1 (through
  `@osdlc/typed-git`), declares `^22.22.2 || ^24.15.0 || >=26`. A narrower
  range here would only repeat a warning that the package manager already
  gives on Node 22 before 22.22.2. It would also turn a warning into a
  statement we have to keep up to date. So the floor stays at `>=22`.

## Consequences

- The README says Node 22 or later, and says macOS and Linux only.
- `pnpm run smoke` runs the built package under Node, to catch a broken emit.
  CI runs the same check on the packed tarball.
- Every runtime loads the build, so the workspace builds first, then
  typechecks and tests. The tests run on Vitest under Node.
