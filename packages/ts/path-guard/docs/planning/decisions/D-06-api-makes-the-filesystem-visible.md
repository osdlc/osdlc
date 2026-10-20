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

The Rust crate has the same split. `resolve` and `contains` use the real disk.
`resolve_with` and `contains_with` take a `Resolver`. `lexical_absolute`
reads cwd.

`escapes` also covers four cases: proved outside the root, containment that
cannot be proved, a root that reduces to the empty path, and a `toRelative`
path not under the root. A caller that branches on `escapes` sees all four.

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
   such as cwd, becomes an argument. Relative input where an absolute path is
   required is an error of kind `not_absolute`.
2. **Filesystem code runs on a guard bound to one filesystem.** TS uses
   `new PathGuard(resolver)`. Rust uses `Guard::new(resolver)` or
   `Guard::std()`. No function takes an optional resolver. The call site names
   its guard, such as `nodeGuard.contains(a, b)`.
3. **Real-disk-only operations live in a `node` module.** These are the open,
   `fstat` and `lstat` race checks. They cannot be faked with a `Resolver`.
   The import path says so: `@osdlc/path-guard/node`.

### Target shape

| Concept               | TypeScript 0.3.0                                                                              | Rust 0.3.0                                   | Replaces                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Relative-path check   | `lexical.validateRelative(raw)`                                                               | `lexical::validate_relative`                 | `validateRelative`, `validate_relative`                                  |
| Text containment      | `lexical.isUnder(root, path)`, both absolute                                                  | `lexical::is_under`                          | `isInside`                                                               |
| Make absolute         | `lexical.absolute(path, cwd)`                                                                 | `lexical::absolute(path, cwd)`               | `lexicalAbsolute`, `lexical_absolute`                                    |
| Back to relative      | `lexical.toRelative(root, abs)`                                                               | `lexical::to_relative`                       | `toRelative`, `to_relative`                                              |
| Filesystem port       | `Resolver { realpath, readlink }`                                                             | `trait Resolver { canonicalize, read_link }` | same                                                                     |
| Bound guard           | `new PathGuard(resolver)`                                                                     | `Guard::new(resolver)`, `Guard::std()`       | optional `Resolver` arguments, `_with` functions                         |
| Join and check        | `guard.resolve(root, raw)`, `guard.tryResolve(root, raw)`                                     | `guard.resolve(root, raw)`                   | `resolveInside`, `tryResolveInside`, `resolve`, `resolve_with`           |
| Resolved containment  | `guard.contains(outer, inner)`                                                                | `guard.contains`                             | `contains`, `contains_with`                                              |
| Partial real path     | `guard.realPath(absPath)`                                                                     | `guard.real_path`                            | `realpathOrSelf`, `canonicalExistingPrefix`, `canonical_existing_prefix` |
| Real-disk guard       | `nodeGuard` from `/node`                                                                      | `Guard::std()`                               | `nodeResolver` and `StdResolver` as hidden defaults                      |
| Race-checked file I/O | `openContainedFile`, `readContainedFile`, `realPathInside`, `existingPathInside` from `/node` | none                                         | same names, moved to `/node`                                             |

The twins keep the same behaviour, the same error kinds and the same cases,
proved by the shared parity fixture. Names follow each language's idiom:
camelCase, a class and a thrown `PathError` in TS; snake_case, `Result` and
no `_with` functions in Rust.

`guard.contains` stays boolean. False also means "cannot prove".

### Error kinds

| Kind             | Meaning                                                                                 | In 0.2               |
| ---------------- | --------------------------------------------------------------------------------------- | -------------------- |
| `escapes`        | Proved outside the root                                                                 | same                 |
| `unresolvable`   | More than `MAX_LINK_HOPS` links, or the call budget spent                               | `escapes`            |
| `empty_root`     | The root reduces to the empty path                                                      | `escapes`            |
| `not_under_root` | `toRelative`: the path does not start with the root as text                             | `escapes`            |
| `not_absolute`   | A lexical check, `lexical.absolute` (its `cwd`) or `guard.realPath` got a relative path | resolved against cwd |

Rust gains the matching `PathError` variants. `PathError` stays
`#[non_exhaustive]`. The kinds arrive in both twins in 0.3.0, as
[D-04](D-04-error-kind-growth.md) requires.

### Packaging

| Language   | Shape                                                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | `package.json` `exports` has `.`, `./lexical` and `./node`. `.` exports `lexical`, `PathGuard`, `Resolver`, `PathError` and `MAX_LINK_HOPS`, and imports no `node:` module. `./lexical` exports the `lexical` functions and `PathError` and stays browser-safe. `./node` adds `nodeGuard`, `nodeResolver` and the race-checked file helpers. |
| Rust       | A `lexical` module, a `guard` module with `Guard<R: Resolver>`, and the error type at the crate root. `Resolver`, `StdResolver` and `MAX_LINK_HOPS` stay at the root.                                                                                                                                                                        |

### `isInside` and `realpathOrSelf`

[D-05](D-05-kept-names-for-0-2.md) kept both for 0.2.x and left them to this
review.

- `isInside` is removed. Its callers use `lexical.isUnder`, which already
  ships in `./lexical`. Both arguments must be absolute. A caller with a
  relative path joins cwd itself:
  `lexical.isUnder(root, lexical.absolute(p, process.cwd()))`.
- `realpathOrSelf` is removed. Its callers use `guard.realPath`, usually
  `nodeGuard.realPath`. The argument must be absolute. The cwd join moves to
  the caller.
- `guard.realPath` also replaces `canonicalExistingPrefix`. The two give up
  differently in 0.2. `realPath` follows `realpathOrSelf`: when the walk gives
  up, it returns the absolute path with `..` folded as text. A missing path is
  not an error.

## Why

- A reader can see which filesystem a call uses. The import path and the guard
  name say it.
- The injectable path becomes the only path. An in-memory `Resolver` can drive
  every filesystem case with no disk access.
- No code reads cwd behind the caller's back.
- A caller can branch on a link loop, an empty root and a proved escape
  separately.
- A rename alone would fix names but keep the hidden defaults.

## Consequences

- Both twins move to 0.3.0 together, as the
  [twin rule](../../../../../README.md#twin-libraries) and
  [D-02](D-02-version-line-and-stability.md) require.
- The parity fixture changes. Nine `escapes` cases change their `error`
  string: 2 `resolve` cases to `empty_root`, 5 `to_relative` cases to
  `not_under_root`, and 2 `resolve_on_disk` cases to `unresolvable`. Cases
  are added for a spent call budget and for `not_absolute`.
- A caller that tests `kind === 'escapes'` changes branch with no compile
  error. A link loop or an empty root no longer matches it.
- `isInside` with a relative argument resolved against cwd. `lexical.isUnder`
  throws `not_absolute` instead.
- Every consumer that adopted 0.2.x migrates.

## Migration

- The Rust crate keeps the 0.2 root functions in 0.3.0 as `#[deprecated]`
  wrappers: `validate_relative`, `to_relative`, `lexical_absolute`,
  `canonical_existing_prefix`, `resolve`, `contains`, `resolve_with` and
  `contains_with`. Each calls the new item. All are removed in 0.4.0.
- The TS package drops the flat exports in 0.3.0 unless the open question
  below decides otherwise.
- Each CHANGELOG lists every removed or moved export and its replacement.
- After both twins publish, the dev monorepo moves its TS and Rust callers in
  one migration PR.

Tasks:

- [T-04](../tasks/T-04-rust-0-3-0-api.md): Rust 0.3.0 API
- [T-05](../tasks/T-05-ts-0-3-0-api.md): TypeScript 0.3.0 API
- [T-06](../tasks/T-06-parity-fixture-0-3-0.md): Parity fixture for 0.3.0

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
   does? Keeping them eases outside callers. Dropping them keeps `.` free of
   `node:` imports in 0.3.0.
3. **Name of the text containment check.** This note uses `isUnder`, which
   already ships in `./lexical`. The other choice is `lexical.contains`.
   `isUnder` keeps the text check's name apart from `guard.contains`, which
   follows symlinks. One name for both would let a caller swap one for the
   other and lose the symlink check without noticing.
4. **Windows paths in the text check.** `isInside` reads `\` and drive letters
   on Windows through `node:path`. `isUnder` takes POSIX paths on every
   platform, because `./lexical` cannot ask which platform it runs on. Does
   `lexical.isUnder` take a platform argument, or do Windows callers of
   `isInside` move to `guard.contains`?
5. **Keep `./lexical`.** `.` imports no `node:` module in 0.3.0, so `./lexical`
   becomes a second way to import the same functions. Keep it for the 0.2.x
   callers that use it, or drop it in 0.3.0?
