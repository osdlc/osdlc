# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0](https://github.com/osdlc/osdlc/releases/tag/tiered-dirs/v0.1.0) - 2026-10-17

First release.

### Added

- `TieredDirs`: directories addressed by tier (`vendor()`, `suite(key)`,
  `standalone(tool)`) and home (`durable`, `config`, `cache`, `logs`,
  `runtime`), plus an untiered `scratch()` root. `Dir::scoped` and `Dir::app`
  narrow a directory. Every segment is checked to be one safe path segment.
- `BaseDirs`: the per-OS base directories, resolved once. Logs go to
  `~/Library/Logs` on macOS, and logs and runtime never go under cache.
- `EnvVars` and `env_vars!`: override variables under a caller-chosen
  prefix, `<P>_ROOT` and `<P>_<HOME>_DIR`, the same on every OS.
- Tests kept off the real home: a cargo test binary defaults to a
  per-process scratch root (`test_root`), and `<P>_REQUIRE_OVERRIDE` turns an
  OS fallback into an error.
- `Error`, marked `#[non_exhaustive]`.
- Minimum supported Rust version 1.85.
