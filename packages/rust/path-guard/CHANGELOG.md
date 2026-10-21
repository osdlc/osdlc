# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
