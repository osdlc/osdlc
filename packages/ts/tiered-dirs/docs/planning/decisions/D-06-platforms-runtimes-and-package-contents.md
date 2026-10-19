---
id: D-06
type: decision
state: accepted
created: 2026-10-18
---

# D-06: Platforms, runtimes and package contents

## Decision

- Node.js is the base target. `engines.node` is `>=22`.
- The code uses `node:os` and `node:path` only. It has no other imports.
- The path tables cover Linux, macOS and Windows. The tests check all three
  by injecting the platform.
- CI runs the package on Linux and macOS, on Node 22 and 24. It does not run
  on a Windows host.
- On win32 the home comes from `USERPROFILE` only. `HOME` is ignored there.
- Bun is not tested. The test-root rule recognises it.
- The package ships compiled ESM and `.d.ts` files under `dist/`, with the
  README, CHANGELOG, licence files, `SECURITY.md` and `CONTRIBUTING.md`. It
  does not ship its TypeScript source or this `docs/` folder. `exports` has
  no `bun` condition and there is no CommonJS build.
- Another runtime or platform is claimed only once a test runs on it.

## Why

- Node refuses to run `.ts` files under `node_modules`, so a package must ship
  JavaScript.
- Rust's `dirs` ignores `HOME` on Windows, and under Cygwin or MSYS `HOME` can
  be a POSIX-style path. Reading `USERPROFILE` only keeps the twins the same.
- Windows CI has not run for this package. The Rust crate runs its tests on
  Windows.
- Node 20 is past end of life.

## Consequences

- Windows behaviour is checked through the injected platform until a Windows
  CI job exists.
- Dropping Node 22 is a breaking change, made in a minor release on the 0.x
  line.
- In this repository, `tsconfig.json` and `vitest.config.ts` map the
  package's own name to `index.ts`, so the examples run before a build.
