---
type: decision
state: accepted
created: 2026-10-20
---

# Runtimes and package contents

## Decision

- Node 22 or later (`engines.node` is `>=22`). Node is the primary runtime.
- ESM only. There is no CommonJS build.
- Bun works. The `bun` export condition points Bun at the TypeScript source,
  so Bun needs no build.
- The tarball ships the `.ts` source files as well as `dist/`, because Bun
  loads them.
- macOS and Linux only for now. Windows waits for a Windows CI job.

## Why

- Node 20 is past end of life. Node 22 and 24 are the supported lines.
- The `bun` condition lets Bun users, and the maintainer's own packages, load
  the source without a build step. Dropping it would make each of them build
  first, for a small gain to other users.
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
- `pnpm run smoke` runs the built package under Node, to catch a broken emit
  that Bun would not show. CI runs the same check on the packed tarball.
- Bun users load the source and Node users load the build. A build bug would
  show for Node users only, which is why the smoke check exists.
- The `bun` condition stays until the maintainer's packages load `dist/`
  instead.
