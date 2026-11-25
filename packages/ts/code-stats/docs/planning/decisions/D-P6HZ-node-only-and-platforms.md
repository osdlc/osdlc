---
id: D-P6HZ
type: decision
state: proposed
created: 2026-11-22
---

# D-P6HZ: Node only, and the platforms

The owner has not yet confirmed the platform statement. This note proposes it.

## Decision

- The package supports Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git`,
  which it reads git through. It is ESM only, and ships compiled `dist/` with `.d.ts` files.
- It does not claim Bun. Bun can load the compiled `dist/`, but no test runs there. The devlink
  spec still runs a selected checkout under Bun, as the other `@osdlc` command-line tools do.
- The README says the tests run and pass on Linux, macOS and, in tier-2 CI, Windows, except the
  file names Windows forbids and the executable-bit check.
- The package is in the Windows tier-2 workflow, and its tests pass there on Node 22 and 24.
  [T-02](../tasks/T-02-windows-tier-2.md) records the run.

## Why

- The home's package shape asks for Node, Vitest under Node and one compiled `dist/`. The package
  used to export its TypeScript source under a `bun` condition, which the shape refuses.
- The package has no `process.platform` branch and keeps paths in one helper, but it starts `git`,
  `gh` and `lizard` and reads `.gitignore` files. Those are the places a Windows run would show a
  difference, and the Windows tier-2 run checks them.

## Consequences

- `engines` is never wider than `@osdlc/typed-git`'s.
- An error text that named how Bun reports a missing program is gone. `@osdlc/command-seam` reads
  Node's `ENOENT`, which is what the package sees.
