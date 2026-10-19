# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.3](https://github.com/osdlc/osdlc/compare/path-guard/v0.2.2...path-guard/v0.2.3) - 2026-10-19

### Added

- *(path-guard)* add lexical_absolute ([#304](https://github.com/osdlc/osdlc/pull/304))

### Added

- `lexical_absolute`, a cwd-anchored lexical fold: `.` dropped, `..` folded, no
  filesystem access. It returns an error when the current directory cannot be
  read.

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
