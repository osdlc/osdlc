---
id: T-05
type: task
state: open
created: 2026-10-20
---

# T-05: TypeScript 0.3.0 API

## Goal

`@osdlc/path-guard` ships the 0.3.0 shape that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets: a
`lexical` namespace, a `PathGuard` class bound to one `Resolver`, a `./node`
entry for the real disk, absolute input, and the split error kinds.

## Today

`index.ts` exports a flat API. `resolve.ts` and `contained.ts` import
`node:fs`, so `.` loads it. The `Resolver` is an optional last argument that
defaults to `nodeResolver`.

Every function that takes a path resolves relative input against cwd:

- `isInside` and `lexicalAbsolute` through `node:path`.
- `realpathOrSelf` through `process.cwd()`.
- `realPathInside`, `existingPathInside`, `openContainedFile` and
  `readContainedFile` through Node `fs`.
- `resolveInside`, `tryResolveInside`, `contains` and
  `canonicalExistingPrefix` through `nodeResolver`.

`./lexical` already ships `validateRelative`, `isUnder`, `toRelative` and
`PathError`, and loads no `node:` module. `isUnder` returns false for a
relative argument.

## Approach

1. Add the `lexical` namespace: `validateRelative`, `isUnder`,
   `absolute(path, cwd)` and `toRelative`. It imports no `node:` module.
2. Add `guard.ts` with `PathGuard`: `resolve`, `tryResolve`, `contains` and
   `realPath`. The walk in `resolve.ts` keeps its logic and moves behind the
   guard. It still uses `node:path` for the platform's path rules.
3. Refuse relative input as D-06's Absolute input section lists: an empty
   root throws `empty_root`, any other relative argument, an empty one
   included, throws `not_absolute`. The guard judges absolute as Rust's
   `Path::is_absolute` does: on Windows a path needs a drive or UNC prefix and
   a root, so `/v` and `\v` are `not_absolute`. Do not use
   `win32.isAbsolute`, which accepts them. `lexical` reads POSIX strings on
   every host.
4. Add `node.ts` with `nodeResolver`, `nodeGuard` and the race-checked file
   helpers from `contained.ts`. Add `./node` to `exports`.
5. Make `.` import no `node:fs`. It may import `node:path`.
6. Add the kinds `unresolvable`, `empty_root`, `not_under_root` and
   `not_absolute` to `PathErrorKind`. Throw each where D-06 says.
7. Remove `isInside`, `realpathOrSelf`, `canonicalExistingPrefix`,
   `lexicalAbsolute`, `resolveInside`, `tryResolveInside` and the flat
   `contains`. Add no `@deprecated` export, alias or re-export for them, as
   the
   [no-legacy-APIs principle](../../../../../README.md#breaking-changes)
   requires.
8. Handle Windows names as D-06's Windows names section says. Add the kinds
   `reserved_name` and `alternate_stream`, the `PathWarning` type, and an
   `onWarning` option on `lexical.validateRelative` and on `PathGuard`.
   `lexical` reads no platform and never refuses these names. `PathGuard`
   refuses them on Windows, using `node:path` for the platform. The package
   writes nothing to the console. Use Microsoft's reserved-name list as D-06
   gives it.

## Acceptance criteria

- [ ] The package version is 0.3.0.
- [x] `exports` has `.`, `./lexical` and `./node`.
- [x] A test fails on any `node:fs` import reachable from `.`, and on any
      `node:` import reachable from `./lexical`.
- [x] `PathGuard` driven by an in-memory `Resolver` passes the filesystem
      cases with no disk access.
- [x] The parity test passes against the 0.3.0 fixture
      ([T-06](T-06-parity-fixture-0-3-0.md)).
- [x] The smoke test imports every entry from the packed tarball.
- [x] The README, TSDoc and CHANGELOG describe the new shape, each removed or
      moved export and its replacement, and name the Rust twin version.
- [x] `lexical.validateRelative` calls `onWarning` for each reserved name and
      stream, on every host, and never throws for them.
- [x] On Windows, `PathGuard.resolve` throws `reserved_name` or
      `alternate_stream` and does not call `onWarning`. On other platforms it
      accepts them and calls `onWarning`. A test shows `resolve` fires the callback.
- [x] With no `onWarning`, nothing is printed.
- [x] No `@deprecated` export remains in the package.
- [x] The CHANGELOG names each behaviour change for a kept name: `isUnder`
      throws `not_absolute` for a relative argument instead of returning
      false, and `toRelative` throws `empty_root`, `not_under_root` and
      `not_absolute` where it threw `parent_segment` or `escapes`.
- [x] [D-05](../decisions/D-05-kept-names-for-0-2.md) is marked
      `superseded` by D-06.
- [ ] The PR links the Rust PR ([T-04](T-04-rust-0-3-0-api.md)), as the
      [twin rule](../../../../../README.md#twin-libraries) asks.
