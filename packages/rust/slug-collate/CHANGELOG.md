# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2](https://github.com/osdlc/osdlc/compare/slug-collate/v0.1.1...slug-collate/v0.1.2) - 2026-10-24

### Other

- plain-language pass over docs and comments ([#444](https://github.com/osdlc/osdlc/pull/444))

## [0.1.1](https://github.com/osdlc/osdlc/releases/tag/slug-collate/v0.1.1) - 2026-10-19

### Added

- *(slug-collate)* add slug-collate 0.1.1 for its first crates.io release ([#294](https://github.com/osdlc/osdlc/pull/294))

First public release.

### Added

- `slugify` and `slugify_with`, with `SlugOptions` (a character cap, apostrophe
  handling, and a configurable separator). NFKD normalisation drops combining
  marks and keeps non-Latin letters, so accented titles fold to ASCII and
  Cyrillic or CJK titles survive rather than slugging down to nothing.
  `SlugOptions` is `#[non_exhaustive]`; build it with `SlugOptions::new()` or
  `SlugOptions::with_max_len(n)`.
- `compare`, a deterministic, portable string comparison: case-insensitive and
  accent-folded, with ties broken by the raw bytes so the order is total.
- `compare_paths`, which compares `/`-separated paths segment by segment, so
  `a/b` sorts before `a-b/c` the way a tree view expects.
- `path_sort_key`, the cached collation key for `compare_paths`, for use with
  `slice::sort_by_cached_key`: it builds each path's key once instead of on
  every comparison, and sorts to exactly `compare_paths`' order.
