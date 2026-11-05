# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-04

Modification times are whole nanoseconds, so a cache can stamp a file
exactly and still match the fractional `mtimeMs` a JavaScript tool reports.

### Changed

- `Metadata::modified_ms: Option<i64>` (milliseconds) is now
  `Metadata::modified_ns: Option<i64>` (nanoseconds since the epoch).
  `Metadata::file` and `Metadata::dir` take nanoseconds. A host with only
  milliseconds multiplies by 1,000,000. A time outside what an `i64` of
  nanoseconds holds (before 1677 or after 2262) is `None`.
- `MemVfs::set_modified(path, ms)` is now `MemVfs::set_modified_ns(path,
  ns)`. Each write still moves a file's time by one whole millisecond.

### Added

- `Metadata::modified_ms` (whole milliseconds, rounded down) and
  `Metadata::modified_ms_f64` (node's `statSync().mtimeMs`, to the last bit).
- `ns_to_ms` and `ns_to_ms_f64`, the two conversions.

## [0.1.0] - 2026-11-04

First release. The file-access trait moved out of skillwright's
`tradecraft-core`, so the vault crates and skillwright share one.

### Added

- `Vfs`, an object-safe file-access trait with no `Send` or `Sync` bound:
  `read_file`, `read_dir`, `exists`, `metadata`, `is_executable`,
  `write_file`, `create_dir_all`, `set_executable`, `rename`, `remove`, and
  `canonicalize`, `read_link`, `is_symlink` and `sees_links` with defaults.
- `Metadata` (`len`, `modified_ms`, `is_dir`, `is_symlink`) and `DirEntry`.
- `NativeVfs` (`std::fs`, behind the default `native` feature), `MemVfs` (in
  memory, with `insert` and `set_modified` for tests) and `PreviewVfs` (captures
  writes as `PreviewWrite` and renames and removals as `PlannedOp`).
- `VfsError`, the one error every implementation returns, with the path and
  an `io::ErrorKind`.
- `Clock`, `SystemClock` (native) and `FixedClock`.
- `normalize`, the lexical `.` and `..` folding the default `canonicalize`
  uses.
