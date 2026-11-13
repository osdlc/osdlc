---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: Runtimes, platforms and package contents

## Decision

- Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git`.
  The tests run on Node with Vitest. Bun runs the built package but is not
  tested.
- Linux and macOS. Windows is not supported yet.
- The tarball ships the compiled `dist/`, the `bin/rule-review.js` launcher
  and the docs, and no TypeScript source.

## Why

- The check runner relies on the executable bit and on process groups to kill
  a script and its children; neither means the same on Windows.
- A package that ships `.ts` source cannot run from `node_modules` under Node.

## Consequences

- Windows support needs a CI job on Windows and a decision on how a check is
  recognised there.
