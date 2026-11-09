# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1](https://github.com/osdlc/osdlc/compare/vfs-walk/v0.2.0...vfs-walk/v0.2.1) - 2026-11-08

### Other

- updated the following local packages: vfs-seam

## [0.2.0] - 2026-11-04

Built on `vfs-seam` 0.2, whose modification times are nanoseconds.

### Changed

- `Entry::mtime_ms: Option<i64>` is now `Entry::mtime_ns: Option<i64>`,
  nanoseconds since the epoch.

### Added

- `Entry::mtime_ms` (whole milliseconds) and `Entry::mtime_ms_f64` (node's
  `mtimeMs`).
- `stat::modified_ns(vfs, path)`. `stat::modified_ms` still returns whole
  milliseconds.

## [0.1.0] - 2026-11-04

First release. The general walk moved out of `markdown-vault-fs`, so code
that only walks files does not depend on vault rules.

### Added

- `walk(vfs, root, opts)` and `walk_subtree(vfs, root, sub, opts)`: a
  depth-first walk through a `vfs-seam` `Vfs`, sorted by name within each
  folder.
- `WalkOptions`: `skip_names`, `prune_dirs`, `filter` (the caller's test on
  each file and folder, asked before any stat), `symlinks` (`Symlinks::List`,
  `Skip` or `Refuse`) and `errors` (`Errors::Skip`, `Report` or `Propagate`).
- `Entry` (`rel`, `abs`, `size`, `mtime_ms`, `is_symlink`), `WalkOutcome`
  (entries and the errors skipped under `Errors::Report`) and `WalkError`
  (`Symlink`, `Io`).
- `stat`: `modified_ms(vfs, path)`, and `ms_since_epoch`, `mtime_ms` and
  `created_ms` for Node's `statSync()` millisecond floats, moved from
  `markdown-vault-fs`.
