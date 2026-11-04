# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
