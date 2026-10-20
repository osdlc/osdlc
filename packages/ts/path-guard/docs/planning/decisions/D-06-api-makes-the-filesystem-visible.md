---
id: D-06
type: decision
state: proposed
created: 2026-10-20
---

# D-06: The 0.3.0 API makes the filesystem visible

## Context

The 0.2 API has three modes. Nothing at the call site tells them apart.

| Mode                      | Exports                                                                                            | What is hidden                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Text only                 | `validateRelative`, `isInside`, `lexicalAbsolute`, `toRelative`                                    | `isInside` and `lexicalAbsolute` read `process.cwd()` for relative input   |
| Resolver (injectable)     | `resolveInside`, `tryResolveInside`, `contains`, `canonicalExistingPrefix`                         | The `Resolver` is an optional last argument that defaults to the real disk |
| Real disk, not injectable | `realpathOrSelf`, `realPathInside`, `openContainedFile`, `readContainedFile`, `existingPathInside` | Node `fs` and cwd are called directly                                      |

The Rust crate has the same split. `resolve`, `contains` and
`canonical_existing_prefix` use the real disk through `StdResolver`.
`resolve_with` and `contains_with` take a `Resolver`.
`canonical_existing_prefix` has no `_with` form. `lexical_absolute` reads cwd.

`escapes` also covers three cases that are not a proved escape: containment
that cannot be proved, a root that reduces to the empty path, and a
`toRelative` path not under the root. A caller that branches on `escapes` sees
all four.

The main consumer is the [sksizer/dev](https://github.com/sksizer/dev)
monorepo. At the time of writing:

| Language   | Fact                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript | About 30 source files import `@osdlc/path-guard`. None passes a `Resolver`. The most used exports are `isInside` (16 files), `resolveInside` (8) and `realpathOrSelf` (5). Several files mix the modes.      |
| Rust       | About 12 crates use `validate_relative`, `resolve`, `contains`, `canonical_existing_prefix` and `to_relative`. One crate injects a filesystem: it passes a virtual-filesystem `Resolver` to `contains_with`. |

## Decision

A call site shows which filesystem it works against. Both twins ship this as
0.3.0, a breaking release.

### Three rules

1. **Pure text code takes no filesystem and reads no ambient state.** It lives
   in a `lexical` namespace (TS) or module (Rust). What it read implicitly,
   such as cwd, becomes an argument.
2. **Filesystem code runs on a guard bound to one filesystem.** TS uses
   `new PathGuard(resolver)`. Rust uses `Guard::new(resolver)` or
   `Guard::std()`. No function takes an optional resolver. The call site names
   its guard, such as `nodeGuard.contains(a, b)`.
3. **Real-disk-only operations live in a `node` module.** These are the open,
   `fstat` and `lstat` race checks. They cannot be faked with a `Resolver`.
   The import path says so: `@osdlc/path-guard/node`.

### Absolute input

Rule 1 removes cwd from the lexical code. A guard given a relative path would
still reach cwd, through its `Resolver`. To keep cwd out of the guard too,
every argument that names a place on the filesystem must be absolute, in the
lexical code and on the guard. The caller joins cwd itself, for example with
`lexical.absolute(p, process.cwd())`.

| Function                                                  | Arguments that must be absolute                          |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `lexical.isUnder(root, path)`                             | `root` and `path`                                        |
| `lexical.absolute(path, cwd)`                             | `cwd`. `path` may be relative.                           |
| `lexical.toRelative(root, abs)`                           | `root` and `abs`                                         |
| `guard.resolve(root, raw)`, `guard.tryResolve(root, raw)` | `root`. `raw` is relative and passes `validateRelative`. |
| `guard.contains(outer, inner)`                            | `outer` and `inner`                                      |
| `guard.realPath(absPath)`                                 | `absPath`                                                |

`lexical.validateRelative(raw)` takes a relative path, as today.

An empty root is refused as `empty_root`. Any other relative argument is
refused as `not_absolute`. The root is checked before the other arguments.
The race-checked helpers in `./node` call the real disk directly and keep
their 0.2 contract.

### Target shape

| Concept               | TypeScript 0.3.0                                                                               | Rust 0.3.0                                              | Replaces                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Relative-path check   | `lexical.validateRelative(raw)`                                                                | `lexical::validate_relative`                            | `validateRelative`, `validate_relative`                                  |
| Text containment      | `lexical.isUnder(root, path)`                                                                  | `lexical::is_under`, returns `Result<bool, PathError>`  | `isInside`                                                               |
| Make absolute         | `lexical.absolute(path, cwd)`                                                                  | `lexical::absolute(path, cwd)`                          | `lexicalAbsolute`, `lexical_absolute`                                    |
| Back to relative      | `lexical.toRelative(root, abs)`                                                                | `lexical::to_relative`                                  | `toRelative`, `to_relative`                                              |
| Filesystem port       | `Resolver { realpath, readlink }`                                                              | `trait Resolver { canonicalize, read_link }`            | same                                                                     |
| Bound guard           | `new PathGuard(resolver)`                                                                      | `Guard::new(resolver)`, `Guard::std()`                  | optional `Resolver` arguments, `_with` functions                         |
| Join and check        | `guard.resolve(root, raw)`, `guard.tryResolve(root, raw)`                                      | `guard.resolve(root, raw)`                              | `resolveInside`, `tryResolveInside`, `resolve`, `resolve_with`           |
| Resolved containment  | `guard.contains(outer, inner)`                                                                 | `guard.contains`, returns `Result<bool, PathError>`     | `contains`, `contains_with`                                              |
| Partial real path     | `guard.realPath(absPath)`                                                                      | `guard.real_path`, returns `Result<PathBuf, PathError>` | `realpathOrSelf`, `canonicalExistingPrefix`, `canonical_existing_prefix` |
| Real-disk guard       | `nodeGuard` from `./node`                                                                      | `Guard::std()`                                          | `nodeResolver` and `StdResolver` as hidden defaults                      |
| Race-checked file I/O | `openContainedFile`, `readContainedFile`, `realPathInside`, `existingPathInside` from `./node` | none                                                    | same names, moved to `./node`                                            |

The twins keep the same behaviour, the same error kinds and the same cases,
proved by the shared parity fixture. Each twin uses its own language's
conventions. TS uses camelCase, a class and a thrown `PathError`. Rust uses
snake_case, `Result` and no `_with` functions.

`guard.contains` answers true or false for absolute input. False also means
"cannot prove". It throws (TS) or returns `Err` (Rust) only for an argument it
refuses: `empty_root` or `not_absolute`. `guard.tryResolve` returns null where
`guard.resolve` throws a `PathError`.

### Error kinds

| Kind             | Meaning                                                                                      | In 0.2                                                           |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `escapes`        | Proved outside the root                                                                      | same                                                             |
| `unresolvable`   | More than `MAX_LINK_HOPS` links, or the call budget spent                                    | `escapes`                                                        |
| `empty_root`     | The root is the empty path. Used by every function that takes a root, `toRelative` included. | `escapes`; `parent_segment` in `toRelative`; false in `contains` |
| `not_under_root` | `toRelative`: the path does not start with the root as text                                  | `escapes`                                                        |
| `not_absolute`   | An argument listed under Absolute input is relative                                          | resolved against cwd; false in `isUnder` and `contains`          |

Rust gains the matching `PathError` variants. `PathError` stays
`#[non_exhaustive]`. The kinds arrive in both twins in 0.3.0, as
[D-04](D-04-error-kind-growth.md) requires.

### Packaging

| Language   | Shape                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `package.json` `exports` has `.`, `./lexical` and `./node`. `.` exports `lexical`, `PathGuard`, `Resolver`, `PathError` and `MAX_LINK_HOPS`. It imports no `node:fs`; it may import `node:path`, which `PathGuard` uses for the platform's path rules. `./lexical` exports the `lexical` functions and `PathError`, imports no `node:` module, and stays browser-safe. `./node` adds `nodeGuard`, `nodeResolver` and the race-checked file helpers. |
| Rust       | A `lexical` module, a `guard` module with `Guard<R: Resolver>`, and the error type at the crate root. `Resolver`, `StdResolver` and `MAX_LINK_HOPS` stay at the root.                                                                                                                                                                                                                                                                               |

### Names decided in this proposal

- The text containment check is `isUnder` (Rust: `is_under`), not
  `lexical.contains`. `guard.contains` follows symlinks and the text check
  does not. One name for both would let a caller swap one for the other and
  lose the symlink check without noticing. `isUnder` already ships in
  `./lexical`.
- `./lexical` stays. Code that must not load Node, such as a browser bundle,
  imports it. `.` may load `node:path`, so it does not serve that need.

### `isInside` and `realpathOrSelf`

[D-05](D-05-kept-names-for-0-2.md) kept both for 0.2.x and left them to this
review.

- `isInside` is removed. Its callers use `lexical.isUnder`. Both arguments
  must be absolute. A caller with a relative path joins cwd itself:
  `lexical.isUnder(root, lexical.absolute(p, process.cwd()))`. In Rust,
  `lexical::is_under` returns `Result<bool, PathError>`.
- `realpathOrSelf` is removed. Its callers use `guard.realPath`, usually
  `nodeGuard.realPath`. The argument must be absolute. The cwd join moves to
  the caller.
- `guard.realPath` also replaces `canonicalExistingPrefix`. The two give up
  differently in 0.2. `realPath` follows `realpathOrSelf`: when the walk gives
  up, it returns the absolute path with `..` folded as text. The answer never
  holds a `..`. A missing path is not an error. In Rust, `Guard::real_path`
  returns `Result<PathBuf, PathError>`, and its only error is `NotAbsolute`.

## Why

- A reader can see which filesystem a call uses. The import path and the guard
  name say it.
- The injectable path becomes the only path. An in-memory `Resolver` can drive
  every filesystem case with no disk access.
- No code reads cwd unless the caller passes it.
- A caller can branch on a link loop, an empty root and a proved escape
  separately.
- A rename alone would fix names but keep the hidden defaults.

## Consequences

- Both twins move to 0.3.0 together, as the
  [twin rule](../../../../../README.md#twin-libraries) and
  [D-02](D-02-version-line-and-stability.md) require.
- The parity fixture changes. 14 cases change their result:

  | Section           | Cases | 0.2 result                    | 0.3.0 result     |
  | ----------------- | ----- | ----------------------------- | ---------------- |
  | `resolve`         | 1     | `escapes` (empty root)        | `empty_root`     |
  | `resolve`         | 1     | `escapes` (root `missing/..`) | `not_absolute`   |
  | `contains`        | 2     | false (empty outer)           | `empty_root`     |
  | `contains`        | 1     | false (outer `missing/..`)    | `not_absolute`   |
  | `to_relative`     | 4     | `escapes`                     | `not_under_root` |
  | `to_relative`     | 1     | `escapes` (relative path)     | `not_absolute`   |
  | `to_relative`     | 1     | ok (relative root and path)   | `not_absolute`   |
  | `to_relative`     | 1     | `parent_segment` (empty root) | `empty_root`     |
  | `resolve_on_disk` | 2     | `escapes` (link loops)        | `unresolvable`   |

  Cases are added for a spent call budget, for `is_under` and for `real_path`.
  [T-06](../tasks/T-06-parity-fixture-0-3-0.md) lists them.

- A caller that tests `kind === 'escapes'` changes branch with no compile
  error. A link loop or an empty root no longer matches it.
- `isInside` with a relative argument resolved against cwd. `lexical.isUnder`
  throws `not_absolute` instead.
- `isUnder` already ships in `./lexical`. Today it returns false for a
  relative argument. In 0.3.0 it throws `not_absolute`. A caller that relied
  on false must catch the error or pass absolute paths.
- A caller that passes a relative root to `resolveInside` or `contains` today
  gets an answer based on cwd. In 0.3.0 the guard refuses it.
- The deprecated Rust wrappers keep their 0.2 results, so a Rust caller sees
  no change until it moves to the new items. It then sees the new kinds, and
  `canonical_existing_prefix` callers that move to `Guard::real_path` get `..`
  folded as text where the walk gives up, instead of the path as written.
- Every consumer that adopted 0.2.x migrates.

## Migration

The Rust crate keeps its 0.2 root functions in 0.3.0 as `#[deprecated]`
wrappers. Each keeps its 0.2 result exactly. All are removed in 0.4.0.

| Wrapper                     | 0.3.0 behaviour                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `validate_relative`         | Same as `lexical::validate_relative`. The results did not change.                                                          |
| `to_relative`               | Keeps 0.2: `Escapes` where the path is not under the root, `ParentSegment` for an empty root, and relative input accepted. |
| `lexical_absolute`          | Keeps 0.2: reads cwd for a relative path.                                                                                  |
| `canonical_existing_prefix` | Keeps 0.2: returns the path as written when the walk gives up, and accepts a relative path.                                |
| `resolve`, `resolve_with`   | Keep 0.2: return `Escapes` where 0.3.0 says `Unresolvable` or `EmptyRoot`, and accept a relative root.                     |
| `contains`, `contains_with` | Keep 0.2: return false for an empty or relative argument, and never return an error.                                       |

The TS package drops the flat exports in 0.3.0 unless the open question below
decides otherwise. Each CHANGELOG lists every removed or moved export and its
replacement. After both twins publish, the dev monorepo moves its TS and Rust
callers.

Tasks:

- [T-04](../tasks/T-04-rust-0-3-0-api.md): Rust 0.3.0 API
- [T-05](../tasks/T-05-ts-0-3-0-api.md): TypeScript 0.3.0 API
- [T-06](../tasks/T-06-parity-fixture-0-3-0.md): Parity fixture for 0.3.0
- [T-07](../tasks/T-07-terms-for-0-3-0.md): Terms for 0.3.0

## Open questions

The owner answers these before code starts.

1. **Windows device names and streams.** Does 0.3.0 refuse Windows reserved
   device names (`NUL`, `CON`, `PRN`, `AUX`, `COM1` to `COM9`, `LPT1` to
   `LPT9`, with or without an extension) and `name:stream` alternate data
   streams? If yes, both twins refuse them in `validateRelative`, with a new
   error kind and fixture cases. [D-03](D-03-platforms.md) says this needs its
   own decision. A breaking release is the cheapest place for it.
2. **Deprecated flat exports in TS.** Does the TS package keep the 0.2 flat
   exports for one minor version, marked `@deprecated`, as the Rust crate
   does? If yes, the ones that use `node:fs` live in `./node`:
   `realpathOrSelf`, `resolveInside`, `tryResolveInside`, `contains`,
   `canonicalExistingPrefix` and `nodeResolver`. The rest stay in `.`:
   `validateRelative`, `toRelative`, `isInside` and `lexicalAbsolute`. A caller
   of a moved export then changes one import path. Dropping them all is
   simpler and makes callers move once.
3. **Windows paths in the text check.** `isInside` reads `\` and drive letters
   on Windows through `node:path`. `isUnder` and `lexical.absolute` take POSIX
   paths on every platform, because `./lexical` cannot ask which platform it
   runs on. Does the `lexical` namespace take a platform argument, or do
   Windows callers of `isInside` move to `guard.contains`?
