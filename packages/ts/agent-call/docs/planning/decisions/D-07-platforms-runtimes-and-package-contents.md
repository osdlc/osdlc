---
id: D-07
type: decision
state: accepted
created: 2026-10-18
---

# D-07: Platforms, runtimes and package contents

## Decision

- Node.js is the only claimed runtime. `engines.node` is `>=22`, the oldest
  supported LTS line.
- Linux and macOS are supported. Windows is untested and the README says so.
  A timeout or abort kills the agent's whole process group, which needs POSIX
  process groups. On Windows the group kill fails, the call falls back to
  killing the direct child, and a grandchild can outlive a timeout.
- The package ships compiled ESM and `.d.ts` files only, under `dist/`. It
  does not ship its TypeScript source, and `exports` has no `bun` condition.
  There is no CommonJS build. Two entry points: `.` and `./models`, which has
  no Node imports so a browser bundle can take the effort vocabulary.
- Tests run on Vitest under Node: CI runs the unit tests on Node 22 and 24,
  the smoke check against the built package, and the clean-consumer check on
  the packed tarball.
- The package spawns through `node:child_process` directly, not
  `@osdlc/command-seam`. This keeps it dependency-free, and it manages
  long-lived process groups.
- Another runtime, such as Bun, Deno or a browser, is claimed only once a
  test runs on it.

## Why

- Node refuses to run `.ts` files under `node_modules`, so a package must
  ship JavaScript.
- Supporting Windows needs a Windows kill path and CI on Windows. That is not
  worth doing before a caller needs it.

## Consequences

- In this repository, `tsconfig.json` and `vitest.config.ts` map the
  package's own name to `src/`, so the examples and the README blocks run
  before a build.
- Dropping Node 22 is a breaking change.
- Windows support is a later addition and needs its own decision.
