# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.22.0] - 2026-11-27

First release on crates.io, published as `osdlc-cli-tool` because the name
`cli-tool` belongs to another crate; the library is still `cli_tool`. The Rust
twin of `@osdlc/cli-tool`, numbered with it: 0.22.0 matches the TypeScript
package's 0.22 line.

### Added

- The groundwork a standalone CLI needs over `clap` 4 (derive): an output seam so
  tests run in process, an injectable `Context`, one table of exit codes, and
  `run` and `run_main` entry points that return exit codes instead of calling
  `std::process::exit`.
- Classified failures (`Failure`, `FailureClass`) with a shared exit code each,
  printed on stderr and, under `--json`, as an error document.
- Versioned `--json` documents (`Report`, `DynReport`, `Outcome`) with
  `schemaVersion` and `kind`, and a JSON Schema derived from each payload type.
- The `help` and `schema` commands a tool adds to its own subcommands, and a
  `testing` module that runs a command in process.
