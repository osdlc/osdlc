# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Moved to osdlc/osdlc as `glob-intersect`, because the crates.io name
  `intersect` belongs to another crate. The library is imported as
  `glob_intersect`.
- Licensed `MIT OR Apache-2.0`, like the other crates in this workspace.
- The tests read the `@osdlc/intersect` corpus in place
  (`packages/ts/intersect/fixtures/`), so the pinned copy, `PIN.json` and
  `tests/pin.rs` are gone. This adds the corpus's three dot-file cases for the
  `fs` layer.

## [0.3.0] - 2026-10-20

Aligned with @osdlc/intersect 0.3.0. The pinned corpus is the content of
[osdlc/osdlc#341](https://github.com/osdlc/osdlc/pull/341); 0.3.0 is not
published yet, so re-check the pin against the release when it is.

### Changed (breaking)

- Every function that reads a pattern now returns `Result<_, Error>`:
  `intersects`, `matches`, `which_match`, `overlapping`, `witness`, `compile`,
  `Matcher::new`, `Matcher::{intersects, overlapping, witness}`, `index`,
  `Registry::applicable_to` and the `segments` functions. `Matcher::matches` and
  `Registry::matching` still return plain values.
- `Error` has new variants `PatternTooDeep` and `UnsupportedSyntax`, and a
  `code()` method. The codes are `DUPLICATE_REGISTRY_ID`, `PATTERN_TOO_DEEP`,
  `UNSUPPORTED_SYNTAX` and `IO_ERROR`, the same strings as the TypeScript
  package. (`INVALID_ARGUMENT` has no Rust form.)
- Syntax that used to be read as plain text is refused with `UnsupportedSyntax`
  when a pattern is compiled: number ranges such as `{1..3}`, a `{...}` group or
  `[...]` class that holds a `/`, and extglobs such as `+(a|b)` and `!(b)`. Escape
  a `(` to match it as text. An unclosed `{` or `[` is still plain text.
- A pattern with `{` groups nested more than 64 deep is refused with
  `PatternTooDeep`.
- `matches`, `which_match`, `Matcher::matches` and `Registry::matching` read the
  path argument as the literal name it is. `matches("pages/[id].vue", &["pages/d.vue"])`
  is now `false`. Patterns are still globs, so escape them to name such a file
  (`pages/\[id\].vue`). The `segments` layer is unchanged.
- Case-insensitive matching folds ASCII letters only. `ß` no longer matches
  `[S]`, `Ä` no longer matches `ä`, and the Kelvin sign no longer matches `k`.
- `witness` keeps searching when the first common path ends in an empty segment,
  so it no longer returns `None` for pairs that share a spellable path. It still
  returns `None` when the only common path cannot be written as a path string.
- `fs`: symbolic links are no longer followed or listed, also with
  `only_files: false`. `absolute: true` with a relative `cwd` returns absolute
  paths. Results are sorted by code point. A `cwd` that is missing or not a
  directory, and a directory that cannot be read, return `Error::Io` instead of
  an empty list.

### Added

- `Error::code()`.
- Tests for the new corpus cases: `parse`, error codes, symbolic links, `cwd`
  variants and unreadable directories.

## [0.2.0] - 2026-10-19

### Changed

- Aligned with @osdlc/intersect 0.2.1.

## [0.1.1] - 2026-09-04

### Fixed

- Five defects found by a whole-codebase bug sweep, fixed in both the Rust and TypeScript tiers
  (segment automaton, path and filesystem layers).

## [0.1.0] - 2026-08-16

### Added

- Initial release: Rust peer port of `intersect`, run against the same conformance corpus as
  the TypeScript package. Includes the segment automaton and sequence product, the path API
  and registry, and a filesystem layer behind the default-on `fs` feature.
- A purpose README.
