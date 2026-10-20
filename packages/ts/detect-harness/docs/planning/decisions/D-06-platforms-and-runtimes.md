---
id: D-06
type: decision
state: accepted
created: 2026-10-19
---

# D-06: Platforms and runtimes

## Decision

- Node.js is the target. `engines.node` is `>=22`.
- The package is ESM only and ships compiled JavaScript and `.d.ts` files
  under `dist/`. It has no CommonJS build and exports no source, so `exports`
  has no `bun` condition.
- The package reads files and may run a program, so it needs Node. It does
  not claim to run in a browser.
- Linux and macOS are supported and tested in CI, on Node 22 and 24.
- Windows is handled in the code but is not tested. The `PATH` lookup tries
  the `PATHEXT` suffixes. The default system root is the `SystemDrive`, not
  `/`. The location table lets a path differ by platform.
- macOS app bundles (`Cursor.app`, `Antigravity.app`) are checked in
  `/Applications` and `~/Applications`. The managed Claude Code settings
  folder differs by platform and is chosen by the `platform` option.

## Why

- Node refuses to run `.ts` files under `node_modules`, so the package ships
  JavaScript.
- Node 22 is the oldest supported LTS line.
- A claim for a platform needs a test that runs on it. Windows has none for
  this package yet, so it is not claimed.
- The `platform`, `systemRoot`, `env`, `home` and `which` options let a test
  run any platform's logic on any host, which keeps the table logic checked
  even where the operating system differs.

## Consequences

- Dropping Node 22 is a breaking change.
- Claiming Windows needs a Windows CI job and a decision that replaces this
  one.
