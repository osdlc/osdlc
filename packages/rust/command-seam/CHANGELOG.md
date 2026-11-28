# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.15.0] - 2026-11-27

First release on crates.io. The Rust twin of `@osdlc/command-seam`, numbered with
it: 0.15.0 matches the TypeScript package's 0.15 line.

### Added

- `CommandRunner`, the trait callers take instead of spawning directly, with
  `SpawnRunner` over `std::process`: no shell, captured stdout and stderr,
  stdin, an environment that is inherited, extended or replaced, a timeout, and
  a cap on output per stream.
- A failed run is a value (`CommandResult`, with `timed_out()` and the
  `StopReason`); `run_checked` turns a non-zero exit, a missing program, a
  timeout or cut-off output into a typed error.
- On unix, one `poll` loop reads both pipes without threads, and
  `RunOptions::process_group` runs a child in its own group that a timeout stops
  with SIGTERM, then SIGKILL. `signal-hook` forwards SIGINT, SIGTERM and SIGHUP
  on request. Other platforms read each pipe on its own thread.
- `testing::FakeRunner`, a recording fake that answers by command line.
- `which` for finding a program on `PATH`, and `shell_quote` and `shell_join`,
  which write the same text as the TypeScript package.
