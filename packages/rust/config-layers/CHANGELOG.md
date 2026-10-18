# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0](https://github.com/osdlc/osdlc/releases/tag/config-layers/v0.6.0) - 2026-10-18

The first release as `config-layers`.

### Renamed from cli-tool-config

`config-layers` is a new crate that carries on from `cli-tool-config` 0.5.1
(0.5.3 only points here). The name changed because the crate layers config
files and is not only for command-line tools. Replace `cli-tool-config` with
`config-layers` in `Cargo.toml` and `cli_tool_config` with `config_layers` in
code. Every change below is breaking against `cli-tool-config` 0.5.1.

- **Breaking:** the crate and its library are named `config-layers` and
  `config_layers`.
- **Breaking:** the YAML crate is `serde-saphyr` 2, replacing `serde_yaml`,
  which is no longer maintained. The generic tree in the public API is
  `serde_json::Value` and `serde_json::Map<String, Value>`, in place of
  `serde_yaml::Value` and `serde_yaml::Mapping`. It affects
  `file::read_mapping`, `file::overlay_top_level`, `file::resolve_paths_at`,
  `value::value_at`, `value::value_is_set` and `needs::Needs::met`. Keys keep
  their order in the file. `serde_json` is re-exported as
  `config_layers::serde_json`.
- **Breaking:** YAML reading changes. Only `true` and `false` are booleans
  (`strict_booleans`), so `yes`, `no`, `on` and `off` stay strings, as in
  `serde_yaml`. Beyond that:
  - YAML tags are dropped and the value kept. The `Tagged` handling in
    `value_is_set` and in the error text is gone.
  - Keys are strings. A scalar key such as `1` or `true` reads as the string
    `"1"` or `"true"`. A list or mapping as a key is a `Malformed` error.
  - Duplicate keys are still an error. The parser limits (`Budget`) are the
    `serde-saphyr` defaults: they cap events, aliases and anchors far above
    any real config file.
- **Breaking:** `file::FileProblem` has a `source` field in place of
  `detail`. `Unreadable { path, source }` holds the `std::io::Error` and
  `Malformed { path, source }` holds the YAML error, or a plain message for an
  empty document or a top level that is not a mapping. The `source` is a
  `Box<dyn std::error::Error + Send + Sync>` that names no YAML crate type;
  downcast it to look closer. The `Display` text keeps the same shape.
  `detail` is gone because the `source` text is the same text.
- **Breaking:** `paths::expand_tokens` is `paths::substitute_path_names` and
  `paths::expand_tokens_with_hint` is `paths::substitute_path_names_with_hint`.
  They replace each `{name}` in a value with the directory `paths:` holds under
  that name. The behaviour and the error text are unchanged.
  `PathTokens`, `path_tokens` and `TokenError` keep their names.
- **Breaking:** `MachineConfigFile<T>` reads the file straight into `T`. A
  file that is not a mapping, or does not match `T`, still gives
  `T::default()` from `load`. `read_strict` reports an empty file as
  `Malformed`, as before; its message for a top level that is not a mapping
  is now the YAML crate's type error for `T`.
- **Breaking:** built on `tiered-dirs` 0.3, which is re-exported as
  `config_layers::tiered_dirs`. Its constructors changed
  (`TieredDirs::from_env(vendor, &vars, ResolveOptions)` and
  `from_env_with`), and `TierKind` is `#[non_exhaustive]`. Callers update
  their `tiered-dirs` code to match.
- **Breaking:** the minimum supported Rust version is 1.89, up from 1.85,
  because `serde-saphyr` needs it.

### Added

- `config_layers::serde_json`, a re-export.
- A usage example on `machine::MachineConfigFile` that runs as a doc-test, and
  one on `paths::substitute_path_names`.
- Tests that `overlay_top_level` keeps every set project value (including
  `false` and `0`) and fills only keys that are missing or unset, and that a
  whitespace-only string is unset.

### Changed

- Rustdoc on the `machine` module and its items says what each is for: the
  machine file is a per-machine settings file that is never committed.
- The README Stability section uses the `tiered-dirs` wording: a breaking
  change ships only in a new 0.x minor release, with a CHANGELOG entry. Notes
  that named a release number (`0.5.z`, "in 0.5") are reworded.
- The description and keywords no longer say the crate is only for
  command-line tools.
