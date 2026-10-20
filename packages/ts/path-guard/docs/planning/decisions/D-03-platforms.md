---
id: D-03
type: decision
state: accepted
created: 2026-10-19
---

# D-03: Platforms

## Decision

- Linux, macOS and Windows are supported. CI runs the tests and the smoke
  check on each, on Node 22 and 24.
- Node.js 22 or later (`engines.node` is `>=22`), ESM only. The
  `@osdlc/path-guard/lexical` entry also runs in browsers.
- On Windows the containment layer reads `\` as a separator, a drive or UNC
  share as a root, and folds `..` as text before it follows a link, as Node
  and Windows do. The paths it returns use `\`. `nodeResolver` uses
  `realpathSync.native`.
- `toRelative` and `isUnder` take POSIX paths on every platform.
- The README lists the Windows limits: names after the root are compared as
  written, and the lexical check does not refuse device names or alternate
  data streams.

## Why

- A guard that misreads a platform's paths fails open: a symlink out of the
  root goes unseen. Windows support means Windows paths are read the way the
  file system reads them, and a CI job proves it.
- Node on Windows resolves every path with `path.resolve` before the file
  system sees it, so `link/..` is the link's directory there. Following the
  POSIX rule on Windows would judge a different path from the one Node opens.
- `toRelative` and `isUnder` are text checks in the browser-safe entry, which
  loads no `node:` module and cannot ask which platform it is on.

## Consequences

- The parity fixture pins the POSIX rule. On Windows, a fixture case with a
  `..` on disk is checked against where the file system puts the path instead
  of the fixture's answer.
- Refusing device names or alternate data streams would change the lexical
  layer of both twins. It needs its own decision.
- The Rust crate does not follow the Windows rule yet. Its walk folds a `..`
  behind a missing name against the real path, as on POSIX, so on Windows it
  can accept a path that Windows opens outside the root. Until
  [T-02](../tasks/T-02-rust-windows-dot-dot-fold.md) lands, the twins do not
  give the same answer on Windows, which the twin rule asks for.
