# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0](https://github.com/osdlc/osdlc/releases/tag/cli-tool-config/v0.1.0) - 2026-10-17

First release.

### Added

- `machine`: `MachineConfigFile<T>`, the per-machine file at
  `<config home>/<tool>/config.yaml` in the standalone tier of a
  `tiered_dirs::TieredDirs`, moved by `<TOOL>_MACHINE_CONFIG` or a variable
  you name. `load()` never errors (a missing or malformed file gives
  `T::default()`) and is memoised per path; `read_strict()` reports the
  specific problem. `env_stem` builds the default variable's stem.
- `paths`: named directories under a `paths:` map (the machine's entry wins
  per name), `{name}` token expansion over path-valued settings, and
  `resolve_config_path` for `~` and relative paths.
- `value`: dotted-key lookup (`value_at`) and "is it set" (`value_is_set`)
  over a YAML value.
- `file`: reading a config file into a YAML mapping, walking up for one by
  name, resolving path settings in place, and the project-over-machine
  top-level overlay.
- `needs`: `Needs`, `KeySpec` and `Need`, the check a command runs before it
  starts, and the one message an unmet need renders.
- `FileProblem` and `Scope` are `#[non_exhaustive]`.
- The `tiered_dirs` crate is re-exported.
- Minimum supported Rust version 1.85.
