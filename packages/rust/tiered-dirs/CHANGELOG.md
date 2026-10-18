# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.1](https://github.com/osdlc/osdlc/compare/tiered-dirs/v0.3.0...tiered-dirs/v0.3.1) - 2026-10-18

### Other

- add @osdlc/tiered-dirs for its 0.3.0 npm release ([#287](https://github.com/osdlc/osdlc/pull/287))

## [0.3.0](https://github.com/osdlc/osdlc/compare/tiered-dirs/v0.2.0...tiered-dirs/v0.3.0) - 2026-10-17

### Added

- `ResolveOptions::test_root` and `ResolveOptions::with_test_root`. On by
  default. Off, `from_env` does not read an unset root variable as
  `test_root()` in a cargo test binary; `<P>_ROOT` and `<P>_REQUIRE_OVERRIDE`
  still apply.

### Changed

- **Breaking:** `BaseDirs` and `TieredDirs` each have two environment
  constructors instead of four, and both take a `ResolveOptions`.
  `from_env` reads the process environment and applies the test rules;
  `from_env_with` reads through a caller's function and applies neither.
  `from_env_opts` and `from_env_opts_with` are removed. Migrate
  `TieredDirs` as below; `BaseDirs` is the same, without the vendor
  argument:
  - `from_env(v, vars)` → `from_env(v, vars, ResolveOptions::new())`
  - `from_env_opts(v, vars, o)` → `from_env(v, vars, o)`
  - `from_env_with(v, vars, f)` → `from_env_with(v, vars, ResolveOptions::new(), f)`
  - `from_env_opts_with(v, vars, o, f)` → `from_env_with(v, vars, o, f)`
- **Breaking:** `TierKind` is `#[non_exhaustive]`. A `match` on it outside
  this crate needs a `_` arm. `TierKind::ALL` is unchanged.

## [0.2.0](https://github.com/osdlc/osdlc/releases/tag/tiered-dirs/v0.2.0) - 2026-10-17

The first release on crates.io.

### Added

- A `state` home: `Home::State`, `Tier::state()`, `<P>_STATE_DIR` and
  `<root>/state`. It is the XDG state home on Linux and Application Support
  on macOS. On Windows it is `%LOCALAPPDATA%\state`, beside each tier's cache
  folder under the same root, never the same folder.
- `Convention`: `Native` (the default) or `Xdg`. `Xdg` gives the XDG paths on
  macOS too; Linux is the same under both, and on Windows `Xdg` means
  `Native`. `BaseDirs::xdg` builds the XDG table under any home.
  `Convention` implements `FromStr`, and `Convention::ALL` lists them.
- `ResolveOptions`, with `with_convention`: how `from_env_opts` and
  `from_env_opts_with` resolve, on `BaseDirs` and `TieredDirs`. `from_env` and
  `from_env_with` use the defaults. A later knob goes on `ResolveOptions`.
- `<P>_CONVENTION=native|xdg` overrides the caller's convention; any other
  value is `Error::InvalidConvention`.
- Minimum supported Rust version 1.85.

### Changed

- **Breaking:** `Home` has a new variant, `State`. `Home` stays exhaustive:
  a new home is a breaking release.
- **Breaking:** `state`, `logs` and `run` are reserved segment names, in any
  case, so no tier lands on another home's root. `suite`, `standalone`,
  `Dir::scoped`, `Dir::app` and `is_valid_segment` refuse them.
- **Breaking:** `Error` and `EnvVars` are `#[non_exhaustive]`. Build
  `EnvVars` with `env_vars!`; a struct literal no longer compiles.
- **Breaking:** `EnvVars::overrides` returns an iterator, not a fixed-size
  array.
- The crate reads `XDG_*` itself, through the same environment as the
  override variables. It ignores a relative value and does not expand `~`.
- `dirs` is accepted from 6 up to, not including, 8.
- The crate forbids unsafe code.

### Removed

- **Breaking:** `BaseDirs::from_parts` is no longer public.

## History before the first public release

These versions were never published. They are rebuilt from the git history.
The crate was developed in a private repository before it moved here.

### [0.1.0] - 2026-10-06 (unpublished)

#### Added

- Initial release, split out of a larger directories crate as the generic
  half: machine-local directories addressed on two axes, tier (`vendor()`,
  `suite(key)`, `standalone(tool)`) and home (`durable`, `config`, `cache`,
  `logs`, `runtime`), plus an untiered `scratch()` root. `Dir::scoped` and
  `Dir::app` narrow a directory, and every segment is checked to be one safe
  path segment.
- Per-OS path table resolved once (`BaseDirs`), with logs in
  `~/Library/Logs` on macOS. Override variables under a caller-chosen prefix
  (`EnvVars`, `env_vars!`, `<P>_ROOT` and `<P>_<HOME>_DIR`), and test
  isolation from the real home directory (`test_root`,
  `<P>_REQUIRE_OVERRIDE`).
