# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-20

A breaking release. A call site now shows which filesystem it works against:
text checks live in the `lexical` module and take no filesystem, and every
filesystem check runs on a `Guard` bound to one `Resolver`. The 0.2 root
functions are removed, with no deprecated wrappers. The TypeScript twin
`@osdlc/path-guard` 0.3.0 makes the same change, and both read the same
conformance fixture. See
[D-06](https://github.com/osdlc/osdlc/blob/main/packages/ts/path-guard/docs/planning/decisions/D-06-api-makes-the-filesystem-visible.md).

### Removed

Each 0.2 root function and what replaces it:

| Removed (0.2)                                | Replacement (0.3.0)                                         |
| -------------------------------------------- | ----------------------------------------------------------- |
| `validate_relative(raw)`                     | `lexical::validate_relative(raw)`                           |
| `to_relative(root, abs)`                     | `lexical::to_relative(root, abs)`                           |
| `lexical_absolute(path)`                     | `lexical::absolute(path, cwd)`, with `cwd` passed in        |
| `resolve(root, raw)`                         | `Guard::std().resolve(root, raw)`                           |
| `resolve_with(&resolver, root, raw)`         | `Guard::new(&resolver).resolve(root, raw)`                  |
| `contains(outer, inner)`                     | `Guard::std().contains(outer, inner)`, now a `Result`       |
| `contains_with(&resolver, outer, inner)`     | `Guard::new(&resolver).contains(outer, inner)`, a `Result`  |
| `canonical_existing_prefix(p)`               | `Guard::std().real_path(p)`, now a `Result`                 |

`PathError`, `Resolver`, `StdResolver` and `MAX_LINK_HOPS` stay at the crate
root.

### Added

- `lexical` module: `validate_relative`, `windows_names`, `is_under`,
  `absolute` and `to_relative`. It reads no filesystem, current directory or
  platform.
- `lexical::is_under(root, path) -> Result<bool, PathError>`: text
  containment of two absolute POSIX paths, after `.` and `..` fold. The crate
  had no such function.
- `lexical::windows_names(raw) -> Vec<PathWarning>`: the segments that are a
  device name or an alternate data stream on Windows, in order, on every
  platform.
- `Guard<R: Resolver>` with `Guard::std()`, `Guard::new(resolver)`,
  `with_warning_handler`, `resolve`, `contains` and `real_path`. `Guard` is
  `Clone`, `Send` and `Sync` when its resolver is.
- `PathWarning { kind, segment }` and `PathWarningKind` (`ReservedName`,
  `AlternateStream`; `#[non_exhaustive]`).
- `PathError` variants `Unresolvable`, `EmptyRoot`, `NotUnderRoot`,
  `NotAbsolute { argument, path }`, `ReservedName` and `AlternateStream`.
  `NotAbsolute`'s `argument` names the parameter refused (`root`, `outer`,
  `inner`, `path` or `cwd`). `PathError` stays `#[non_exhaustive]`.
- `Resolver` is implemented for `&R` and `Arc<R>`, so a guard can borrow or
  share a resolver.

### Changed

- Every path argument of a guard, and the root, `cwd` and path of
  `lexical::is_under`, `lexical::absolute` and `lexical::to_relative`, must
  be absolute. An empty root is `EmptyRoot`. Any other relative or empty
  argument is `NotAbsolute`. The root is checked first. Before, a relative
  root or path was resolved against the current directory.
- A guard reads "absolute" as the platform does: on Windows a drive or share
  and a root. `lexical::is_under`, `lexical::absolute` and
  `lexical::to_relative` read POSIX paths on every platform, so `\` is part of
  a name. `lexical_absolute` and `to_relative` used the platform's paths.
  On Windows, `lexical::to_relative` now returns `NotAbsolute` for a Windows
  path such as `C:\v\a`. To turn a guarded path back into a relative one
  there, use `Path::strip_prefix` on two paths from `Guard::real_path`.
- A link loop, more than `MAX_LINK_HOPS` links, or a spent call budget is
  `Unresolvable`, no longer `Escapes`. `Escapes` now means a proved escape.
- An empty root is `EmptyRoot` in `resolve` (was `Escapes`), `contains` (was
  `false`) and `to_relative` (was `ParentSegment`).
- `to_relative` returns `NotUnderRoot` for a path not under the root (was
  `Escapes`). It compares the paths as text, dropping `.` and empty segments.
- `contains` returns `Result<bool, PathError>`. `Ok(false)` also means
  "cannot prove". `Err` is only for a refused argument.
- `real_path` folds `..` as text where the walk gives up. Its answer is
  always absolute and never holds a `..`. `canonical_existing_prefix`
  returned the path as written.
- A guard refuses a root whose real path is not absolute, such as the empty
  path a broken `Resolver` may answer: `resolve` returns `Escapes` and
  `contains` returns `Ok(false)`, as 0.2.5 did for an empty real root.
- On Windows a guard refuses a segment that is a reserved device name (`NUL`,
  `com1.txt` and the rest of Microsoft's list, plus `COM0`, `LPT0`,
  `CONIN$` and `CONOUT$`) as `ReservedName`, and one with a `name:stream` as
  `AlternateStream`, before it reads the filesystem. Elsewhere it accepts them
  and, for a path it accepts, sends each to its warning handler. Before, every
  platform accepted them. The crate never writes to the console.

## [0.2.5](https://github.com/osdlc/osdlc/compare/path-guard/v0.2.4...path-guard/v0.2.5) - 2026-10-20

### Fixed

- *(path-guard)* fold `..` as text on Windows before following a link ([#350](https://github.com/osdlc/osdlc/pull/350))

### Fixed

- On Windows the containment layer folds `..` as text before it follows a
  link, as Windows does. Before, it folded a `..` behind a missing name against
  the link's real target, as on Unix, so `resolve` and `contains` could accept
  a path that Windows opens outside the root.
- On Windows the containment layer follows every link in a chain. Before, it
  stopped after the first link and judged the rest as written, so a chain of
  links, or a loop, whose later link points outside the root was accepted.

## [0.2.4](https://github.com/osdlc/osdlc/compare/path-guard/v0.2.3...path-guard/v0.2.4) - 2026-10-20

### Other

- propose the 0.3.0 API decision (D-06) ([#342](https://github.com/osdlc/osdlc/pull/342))

## [0.2.3](https://github.com/osdlc/osdlc/compare/path-guard/v0.2.2...path-guard/v0.2.3) - 2026-10-19

### Added

- *(path-guard)* add lexical_absolute ([#304](https://github.com/osdlc/osdlc/pull/304))
- `lexical_absolute`, a cwd-anchored lexical fold: `.` dropped, `..` folded, no
  filesystem access. It returns an error when the current directory cannot be
  read.
- The TypeScript twin `@osdlc/path-guard` has the same two layers and reads the
  same conformance fixture.

## [0.2.2] - 2026-10-18

First public release. Shares one conformance fixture with the TypeScript twin
`@osdlc/path-guard`.

### Added

- `validate_relative`, `resolve`, `resolve_with`, `contains`, `contains_with`,
  `canonical_existing_prefix`, `to_relative` and `PathError`: the two-layer
  path containment guard.
- The `Resolver` trait and `StdResolver`, so the containment layer runs over
  the real filesystem or any other, such as an in-memory one.
- `MAX_LINK_HOPS`, the number of dangling symlinks one check follows.

### Notes

- `PathError` is `#[non_exhaustive]`, so a later release may add a variant
  without breaking callers.
- Minimum supported Rust version 1.85, edition 2024.
