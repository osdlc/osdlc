---
id: D-06
type: decision
state: accepted
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
refused as `not_absolute`, an empty one included: `empty_root` is for roots
only, so an empty `cwd`, `inner`, path or `realPath` argument is
`not_absolute`. The root is checked before the other arguments.

What counts as absolute depends on the code:

- `lexical` reads POSIX strings on every host. A path is absolute when it
  starts with `/`.
- The guard uses the platform's rule, as Rust's `Path::is_absolute` does. On
  POSIX a path is absolute when it starts with `/`. On Windows it needs a
  drive or UNC prefix and a root, such as `C:\v` or `\\server\share\v`. A
  rooted path with no drive, such as `\v` or `/v`, is `not_absolute` there.
  TS uses the same rule, not `win32.isAbsolute`, which accepts `\v`.
The race-checked helpers in `./node` call the real disk directly and keep
their 0.2 contract.

### Target shape

| Concept               | TypeScript 0.3.0                                                                               | Rust 0.3.0                                                        | Replaces                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Relative-path check   | `lexical.validateRelative(raw)`                                                                | `lexical::validate_relative`                                      | `validateRelative`, `validate_relative`                                  |
| Windows names         | `lexical.validateRelative(raw, { onWarning })` reports; `PathGuard` refuses on Windows         | `lexical::windows_names(raw)` reports; `Guard` refuses on Windows | accepted before 0.3.0                                                    |
| Text containment      | `lexical.isUnder(root, path)`                                                                  | `lexical::is_under`, returns `Result<bool, PathError>`            | `isInside`                                                               |
| Make absolute         | `lexical.absolute(path, cwd)`                                                                  | `lexical::absolute(path, cwd)`                                    | `lexicalAbsolute`, `lexical_absolute`                                    |
| Back to relative      | `lexical.toRelative(root, abs)`                                                                | `lexical::to_relative`                                            | `toRelative`, `to_relative`                                              |
| Filesystem port       | `Resolver { realpath, readlink }`                                                              | `trait Resolver { canonicalize, read_link }`                      | same                                                                     |
| Bound guard           | `new PathGuard(resolver)`                                                                      | `Guard::new(resolver)`, `Guard::std()`                            | optional `Resolver` arguments, `_with` functions                         |
| Join and check        | `guard.resolve(root, raw)`, `guard.tryResolve(root, raw)`                                      | `guard.resolve(root, raw)`                                        | `resolveInside`, `tryResolveInside`, `resolve`, `resolve_with`           |
| Resolved containment  | `guard.contains(outer, inner)`                                                                 | `guard.contains`, returns `Result<bool, PathError>`               | `contains`, `contains_with`                                              |
| Partial real path     | `guard.realPath(absPath)`                                                                      | `guard.real_path`, returns `Result<PathBuf, PathError>`           | `realpathOrSelf`, `canonicalExistingPrefix`, `canonical_existing_prefix` |
| Real-disk guard       | `nodeGuard` from `./node`                                                                      | `Guard::std()`                                                    | `nodeResolver` and `StdResolver` as hidden defaults                      |
| Race-checked file I/O | `openContainedFile`, `readContainedFile`, `realPathInside`, `existingPathInside` from `./node` | none                                                              | same names, moved to `./node`                                            |

The twins keep the same behaviour, the same error kinds and the same cases,
proved by the shared parity fixture. Each twin uses its own language's
conventions. TS uses camelCase, a class and a thrown `PathError`. Rust uses
snake_case, `Result` and no `_with` functions.

`guard.contains` answers true or false for absolute input. False also means
"cannot prove". It throws (TS) or returns `Err` (Rust) only for an argument it
refuses: `empty_root` or `not_absolute`. `guard.tryResolve` returns null where
`guard.resolve` throws a `PathError`.

### Error kinds

| Kind               | Meaning                                                                                      | In 0.2                                                           |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `escapes`          | Proved outside the root                                                                      | same                                                             |
| `unresolvable`     | More than `MAX_LINK_HOPS` links, or the call budget spent                                    | `escapes`                                                        |
| `empty_root`       | The root is the empty path. Used by every function that takes a root, `toRelative` included. Roots only. | `escapes`; `parent_segment` in `toRelative`; false in `contains` |
| `not_under_root`   | `toRelative`: the path does not start with the root as text                                  | `escapes`                                                        |
| `not_absolute`     | An argument listed under Absolute input is relative. An empty argument that is not a root, such as `cwd`, `inner`, a path or the `realPath` input, is this kind. | resolved against cwd; false in `isUnder` and `contains`          |
| `reserved_name`    | On Windows, a segment is a reserved device name. The guard refuses it.                       | accepted                                                         |
| `alternate_stream` | On Windows, a segment has a `name:stream` alternate data stream. The guard refuses it.       | accepted                                                         |

Both Windows kinds are described under Windows names below. Rust gains the
matching `PathError` variants (`ReservedName`, `AlternateStream`). `PathError` stays
`#[non_exhaustive]`. The kinds arrive in both twins in 0.3.0, as
[D-04](D-04-error-kind-growth.md) requires.

### Packaging

| Language   | Shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `package.json` `exports` has `.`, `./lexical` and `./node`. `.` exports `lexical`, `PathGuard`, `Resolver`, `PathError`, `PathWarning` and `MAX_LINK_HOPS`. It imports no `node:fs`; it may import `node:path`, which `PathGuard` uses for the platform's path rules. `./lexical` exports the `lexical` functions, `PathError` and `PathWarning`, imports no `node:` module, and stays browser-safe. `./node` adds `nodeGuard`, `nodeResolver` and the race-checked file helpers. |
| Rust       | A `lexical` module, and `Guard<R: Resolver>` exported at the crate root from a private `guard` module, with the error type, `PathWarning` and `PathWarningKind` at the crate root. `lexical::windows_names` is in the `lexical` module. `Resolver`, `StdResolver` and `MAX_LINK_HOPS` stay at the root.                                                                                                                                                                                                                   |

### Windows names

Some names mean a device or a stream on Windows and an ordinary file elsewhere.
Both twins handle them in two steps.

`lexical` reads no platform and takes no platform argument. It never refuses
these names. It reports each one as a warning, on every host.
`lexical.validateRelative(raw, { onWarning })` calls `onWarning` once per
match, in segment order. In Rust, `lexical::windows_names(raw)` returns the
matches as `Vec<PathWarning>`, and `lexical::validate_relative(raw)` is
unchanged. Both report only for input that `validateRelative` accepts. For
input it refuses, such as `../NUL` or `C:x`, `validateRelative` throws its own
error first and `windows_names` returns nothing.

The guard knows its platform: `PathGuard` through `node:path`, `Guard` through
`cfg!(windows)`. On Windows the guard refuses the first match, in `resolve`
and `tryResolve` before it reads the filesystem. It does not call the
warning handler there; the error carries the kind. On other platforms the
guard accepts the path and calls its warning handler once per match. The
handler fires only where the path is accepted. The handler is
silent by default, and the library never writes to the console.

A match is one of two kinds. The check runs on every segment, not only the
last, after `\` has become `/`. The base name of a segment is its text up to
the first `.` or `:`, with trailing spaces removed. Input that starts with a
drive letter, `C:x` included, is refused earlier as `windows_path` on every
platform, so it never reaches this check.

- `reserved_name`: the base name is a reserved device name, compared case
  insensitive. The names are Microsoft's documented list: `CON`, `PRN`,
  `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9` and the superscript forms
  `COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, `LPT³`. See
  [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).
  We add three kinds of name beyond that list, because refusing them costs
  little: `COM0` and `LPT0`, which some Windows versions treat as devices,
  and the console devices `CONIN$` and `CONOUT$`, which `CreateFile` opens.
  `NUL`, `nul.txt`, `NUL .txt`, `CON.` and `CON:` all match. `CLOCK$` is not
  in the list: Windows NT has no such device.
- `alternate_stream`: the segment has a `:` and the base name is not a
  reserved name. `ab:c` and `file.txt:stream` match. `a:b` does not reach
  the check: a single letter then `:` at the start is a drive, refused as
  `windows_path`. `reserved_name` wins when
  both could apply, so `CON:` and `NUL:x` are `reserved_name`.

The kinds are separate because a caller may react differently. A device name
can be renamed, while a stream is a different file attribute. Two small kinds
cost no more than one, under [D-04](D-04-error-kind-growth.md).

A warning has a kind and the segment that caused it. Its kinds are the same
strings as the error kinds.

| Item           | TypeScript                                                                     | Rust                                                                                                |
| -------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Warning type   | `PathWarning { kind: 'reserved_name' \| 'alternate_stream'; segment: string }` | `PathWarning { kind: PathWarningKind, segment: String }`; `PathWarningKind` is `#[non_exhaustive]`  |
| Lexical report | `lexical.validateRelative(raw, { onWarning })`                                 | `lexical::windows_names(raw) -> Vec<PathWarning>`                                                   |
| Guard handler  | `new PathGuard(resolver, { onWarning })`                                       | `Guard::with_warning_handler(f)`, `f: Fn(&PathWarning) + Send + Sync + 'static`, stored in an `Arc` |
| Guard refusal  | `PathError` of kind `reserved_name` or `alternate_stream`, on Windows          | `PathError::ReservedName` or `PathError::AlternateStream`, on Windows                               |

The `Arc` keeps `Guard` `Clone`, `Send` and `Sync`.

### Windows paths in the text check

`lexical` stays POSIX on every platform. It reads no platform and takes no
platform argument. `lexical.isUnder` and `lexical.absolute` read `/` only. A
Windows caller of `isInside` moves to `guard.contains`, which reads Windows
paths through `node:path`.

### Names

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
- The Rust free functions are removed in 0.3.0, as the TS flat exports are. A
  Rust caller moves to the new items in one pass and sees the new kinds.
  `canonical_existing_prefix` callers that move to `Guard::real_path` get `..`
  folded as text where the walk gives up, instead of the path as written.
- A path with a device name or a stream is accepted today. In 0.3.0 the guard
  refuses it on Windows. On other platforms the guard accepts it, and a
  caller that sets `onWarning` hears about it. `lexical` never refuses it and
  warns on every host.
- A Windows caller of `isInside` moves to `guard.contains`. `lexical.isUnder`
  does not read `\` or drive letters.
- Rust `to_relative` read Windows paths in 0.2. `lexical::to_relative` is
  POSIX, so a Windows path is `not_absolute`; a Windows caller uses
  `Path::strip_prefix` on paths from `Guard::real_path`.
- Every consumer that adopted 0.2.x migrates.

## Migration

Both twins drop the 0.2 API in 0.3.0. They keep no deprecated wrappers or
flat exports, as the
[no-legacy-APIs principle](../../../../../README.md#breaking-changes) requires.
Each CHANGELOG lists every removed or moved item and its replacement. After
both twins publish, the dev monorepo moves its TS and Rust callers in one
pass.

Tasks:

- [T-04](../tasks/T-04-rust-0-3-0-api.md): Rust 0.3.0 API
- [T-05](../tasks/T-05-ts-0-3-0-api.md): TypeScript 0.3.0 API
- [T-06](../tasks/T-06-parity-fixture-0-3-0.md): Parity fixture for 0.3.0
- [T-07](../tasks/T-07-terms-for-0-3-0.md): Terms for 0.3.0
