# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- On Unix, an overwrite creates the temp file with the target's kept mode
  (less the umask), then sets that mode exactly. Before, the temp file was
  created with `0o666` less the umask and given the kept mode only after the
  content was written, so the content of an owner-only file could be readable
  by others while it was written.

## [0.2.3](https://github.com/osdlc/osdlc/compare/etag-write/v0.2.2...etag-write/v0.2.3) - 2026-10-24

### Other

- plain-language pass over docs and comments ([#444](https://github.com/osdlc/osdlc/pull/444))

## [0.2.2](https://github.com/osdlc/osdlc/compare/etag-write/v0.2.1...etag-write/v0.2.2) - 2026-10-22

### Other

- *(changelog)* correct the MSRV notes for path-guard and its siblings ([#398](https://github.com/osdlc/osdlc/pull/398))

## [0.2.1](https://github.com/osdlc/osdlc/compare/etag-write/v0.2.0...etag-write/v0.2.1) - 2026-10-19

### Added

- *(config-layers)* add config-layers 0.6.0, replacing cli-tool-config ([#286](https://github.com/osdlc/osdlc/pull/286))

### Other

- *(etag-write)* say that write_cas is not atomic with its etag check ([#280](https://github.com/osdlc/osdlc/pull/280))

### Changed

- The minimum supported Rust version is 1.89, up from 1.85. The whole workspace
  moved together; slug-collate and config-layers (through `serde-saphyr`) need
  1.89.

## [0.2.0](https://github.com/osdlc/osdlc/compare/etag-write/v0.1.1...etag-write/v0.2.0) - 2026-10-17

### Changed

- **Breaking:** `etag_of_file` returns the new `ReadError`, which carries the path, instead of `std::io::Error`. A missing file is still `Ok(None)`.

## [0.1.1](https://github.com/osdlc/osdlc/compare/etag-write/v0.1.0...etag-write/v0.1.1) - 2026-10-17

### Other

- *(etag-write)* re-wrap the edited README paragraphs
- *(etag-write)* state that CI runs the tests on Linux, macOS and Windows

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
