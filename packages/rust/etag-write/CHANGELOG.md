# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Breaking:** `etag_of_file` returns `ReadError`, which carries the path,
  instead of `std::io::Error`. A missing file is still `Ok(None)`. `WriteError`
  is unchanged.

### Added

- `ReadError`, marked `#[non_exhaustive]`, with the `path` and the `source`
  `io::Error`.

## [0.1.0](https://github.com/osdlc/osdlc/releases/tag/etag-write/v0.1.0) - 2026-10-16

First release.

### Added

- `write_atomic`: write a temp file in the same directory, fsync it, rename it
  over the target and fsync the directory. Creates parent directories.
  Overwriting a file keeps its permissions, without the setuid, setgid and
  sticky bits.
- `write_cas`: an atomic write that refuses to overwrite a file changed since it
  was read (`Conflict`), or an existing file when no etag is sent
  (`ExistsWithoutEtag`).
- `write_if_changed`: skips the write when the bytes are the same.
- `etag` and `etag_of_file`: lowercase hex sha256. A missing file has no etag;
  an unreadable file is an error, never treated as absent.
- `WriteError`, marked `#[non_exhaustive]`.
- Minimum supported Rust version 1.85.
