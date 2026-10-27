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
  `@osdlc/command-seam`'s runners, because it manages long-lived process
  groups. (Amended 2026-10-25: it now depends on `@osdlc/command-seam` for
  the binary lookup. See the amendment below.)
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

## Amendment, 2026-10-25: depend on `@osdlc/command-seam` for the binary lookup

The package was dependency-free. It now has one runtime dependency,
`@osdlc/command-seam`, and uses its `which` with `absolutePathOnly` to find
the agent binary before it spawns.

Why: an agent call usually runs with `cwd` inside a checkout the caller does
not control, such as a pull request's worktree. A bare name like `claude`
spawned directly is looked up on `PATH`, and a relative or empty entry
(`.`, `bin`, `a::b`) is resolved from that `cwd`. A repository that ships
its own `claude` would then run in place of the installed one. The repo's
other runners (git, gh, curl, sh) closed the same hole with command-seam's
absolute-`PATH`-only lookup. That lookup has the platform rules a copy would
have to keep in step with: `PATHEXT` on Windows, quoted entries, drive and
UNC prefixes. One implementation is safer than two, and the lookup is worth
more than the "no dependencies" property it costs.

What changes:

- A bare name is resolved on the absolute entries of the child's `PATH`
  only, and the absolute path found is spawned. A name that holds a path
  separator is run as given.
- A name found only on a relative or empty entry, or not at all, resolves
  the call as `spawn-failed`, with a message saying relative and empty
  `PATH` entries are skipped.
- The spawn itself, its process group and its kill path stay on
  `node:child_process`, as decided above.
- `@osdlc/command-seam` must never depend on this package.
