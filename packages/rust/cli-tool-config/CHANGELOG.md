# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The minimum supported Rust version is 1.89, up from 1.85. The whole workspace
  moved together because `config-layers` needs `serde-saphyr`, which needs 1.89.

## [0.5.3](https://github.com/osdlc/osdlc/compare/cli-tool-config/v0.5.2...cli-tool-config/v0.5.3) - 2026-10-18

The last release. The crate continues as
[`config-layers`](https://crates.io/crates/config-layers) 0.6.0.

### Changed

- The README and the crate description point to `config-layers`. No code
  changed.

## [0.5.2](https://github.com/osdlc/osdlc/compare/cli-tool-config/v0.5.1...cli-tool-config/v0.5.2) - 2026-10-19

### Added

- *(slug-collate)* add slug-collate 0.1.1 for its first crates.io release ([#294](https://github.com/osdlc/osdlc/pull/294))

## [0.5.1](https://github.com/osdlc/osdlc/compare/cli-tool-config/v0.5.0...cli-tool-config/v0.5.1) - 2026-10-18

### Added

- *(tiered-dirs)* 0.3.0 constructor, TierKind and test-root changes ([#260](https://github.com/osdlc/osdlc/pull/260))

## [0.5.0](https://github.com/osdlc/osdlc/releases/tag/cli-tool-config/v0.5.0) - 2026-10-17

The first release on crates.io.

### Added

- The `tiered_dirs` crate is re-exported, so a caller names the same version
  this crate was built against.
- Minimum supported Rust version 1.85.

### Changed

- **Breaking:** the crate is renamed from `cli-config` to `cli-tool-config`.
- **Breaking:** `MachineConfigFile::new` takes the tool name and a
  `tiered_dirs::TieredDirs`, which carries the vendor and the override
  variables, and returns a `Result` instead of panicking. The file stays at
  `<config home>/<tool>/config.yaml` in the standalone tier.
- **Breaking:** `resolve_paths_at` takes the home directory that `~`
  expands to, instead of using the base directory for it.
- **Breaking:** `FileProblem` and `Scope` are `#[non_exhaustive]`.
- Built on `tiered-dirs` 0.2. The crate no longer depends on a private
  directories crate, so it can be published.
- The need message says "this command" when no command words are given.
- The crate forbids unsafe code.

### Removed

- **Breaking:** `MachineConfigFile::with_base_dirs`. Pass the directories to
  `new` instead.

## History before the first public release

These versions were never published. They are rebuilt from the git history.
They were the config part of a TypeScript CLI package and its Rust twin (this
crate, then named `cli-config`), developed in a private repository before they
moved here.

### [0.4.0] - 2026-10-06 (unpublished)

#### Changed

- **Breaking (TypeScript):** the machine file takes the tool's own vendor
  directories, so it lives under the tool's vendor-scoped config home
  (`<config>/<tool>/`) instead of a fixed vendor folder. The directories come
  from `tiered-dirs`.
- Machine-config writes (TypeScript) are atomic, through `etag-write`.

### [0.3.0] - 2026-10-04 (unpublished)

#### Added

- Safe machine-config writes and migrations (TypeScript): a write replaces
  the machine file atomically after a schema check and keeps a `.bak`, and a
  list of migrations upgrades an older file on load.

#### Changed

- An invalid machine config file (TypeScript) keeps its valid sections and
  reports what it dropped, instead of falling back to the defaults whole. An
  unreadable file is reported apart from a YAML error.

### [0.2.1] - 2026-09-26 (unpublished)

No config changes.

### [0.2.0] - 2026-09-18 (unpublished)

#### Added

- The Rust twin, the `cli-config` crate 0.1.0:
  - `paths`: named directories under a `paths:` map and `{name}` token
    expansion over path-valued settings, plus `resolve_config_path` for `~`
    and relative expansion.
  - `value`: dotted-key lookup (`value_at`) and "is it set"
    (`value_is_set`) over a YAML value.
  - `file`: reading a config file into a YAML mapping, walking up for one by
    name, resolving path settings in place, and the project-over-machine
    top-level overlay.
  - `machine`: `MachineConfigFile<T>`, whose `load()` never errors (a missing
    or malformed file gives `T::default()`) and whose `read_strict()` reports
    the specific problem. `<TOOL>_MACHINE_CONFIG`, or a variable you name,
    moves the file. `env_stem` builds the variable's stem.
  - `needs`: `Needs`, `KeySpec` and `Need`, the check a command runs before
    it starts. A tool declares a static `KeySpec` table beside its serde
    structs.

### [0.1.0] - 2026-09-14 (unpublished)

#### Added

- The config part, in TypeScript: named directories under a `paths:` map
  and `{token}` expansion, where an unknown token is an error rather than an
  empty string; the needs check and its one message for an unmet need;
  dotted-key lookup and the other schema pieces; and the machine file at
  `<config>/<tool>/config.yaml`, read through a schema, where a missing or
  invalid file gives the defaults and `<STEM>_MACHINE_CONFIG` moves it.
