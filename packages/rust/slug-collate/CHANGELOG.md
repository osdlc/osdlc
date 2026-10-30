# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0](https://github.com/osdlc/osdlc/compare/slug-collate/v0.1.1...slug-collate/v0.2.0) - 2026-10-30

### Changed

- **BREAKING:** `slugify` and `slugify_with` keep a combining mark in the word
  with its letter. Before, a mark outside the Latin combining-diacritic blocks
  that is not alphabetic became a separator, so distinct titles collided
  (`ก่า` and `ก้า` both slugged to `ก-า`, `カイド` and `カイト` both to `カイト`)
  and words split (`ガイド` became `カ-イト`, `नमस्ते` became `नमस-ते`). Slugs now
  normalise with NFKC and drop only optional decoration: Latin, Greek and
  Cyrillic diacritics (`café` is still `cafe`), Hebrew niqqud and
  cantillation, and Arabic harakat. Kana voicing marks, Indic viramas and
  vowel signs, Thai tone and vowel marks and every other mark are kept. Each
  word comes out in NFC, so Hangul is precomposed syllables instead of jamo,
  and a length cap never cuts a letter off its marks. Hebrew niqqud and Arabic
  harakat, which were kept before, are now dropped. Latin and ASCII titles
  slug as before; `compare`, `compare_paths` and `path_sort_key` are
  unchanged.

  Migrating: a stored slug for a non-Latin title can differ from what 0.2
  generates for it. Keep stored slugs (filenames, ids, URLs) as they are
  rather than regenerating them from titles; see "Migrating from 0.1" in the
  README.

## [0.1.2](https://github.com/osdlc/osdlc/compare/slug-collate/v0.1.1...slug-collate/v0.1.2) - 2026-10-24

Yanked. This release contained the breaking `slugify` change listed under
0.2.0 by mistake. Use 0.2.0 instead.

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
