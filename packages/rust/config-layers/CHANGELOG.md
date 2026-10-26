# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- `substitute_path_names` and `substitute_path_names_with_hint` keep a `{`
  that is followed by another `{` before any `}` as written, as the TypeScript
  twin does. `{a{dev}` now gives `{a` then the `dev` directory, and `{{dev}}`
  gives the directory in braces. Before, both were an `unknown path name`
  error naming `{a{dev}` or `{{dev}`. The shared `parity.json` fixture covers
  both cases.

## [0.7.0] - Unreleased

Aligned with `@osdlc/config-layers` 0.7.1. The twins share the major and minor
version, so the crate skips 0.6.1 and goes to 0.7.0. The TypeScript 0.7.0 split
its directory and did-you-mean helpers into subpaths. That has no Rust
counterpart. The TypeScript 0.7.1 stopped reading a relative `HOME`. The crate
never reads `$HOME`, so it needs no change for that.

### Changed

- **Breaking:** `resolve_config_path` expands only `~` and `~/…`. A `~user/x`
  value used to become `<home>user/x`. It is now left as written and resolves
  as a relative path, as in the TypeScript twin.
- **Breaking:** `resolve_config_path` leaves `~` unexpanded when `home` is
  empty. It used to give `/x` for `~/x`.
- The shared `parity.json` fixture covers both cases, and a relative `home`.

## [0.6.1](https://github.com/osdlc/osdlc/compare/config-layers/v0.6.0...config-layers/v0.6.1) - 2026-10-24

### Other

- plain-language pass over docs and comments ([#444](https://github.com/osdlc/osdlc/pull/444))

## [0.6.0] - Unreleased

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
  `value::value_at`, `value::value_is_set` and `needs::Needs::met`. The map
  iterates in sorted key order, unless a consumer turns on `serde_json`'s
  `preserve_order` feature. `serde_json` is re-exported as
  `config_layers::serde_json`.
- **Breaking:** YAML reading changes. Only `true` and `false` are booleans
  (`strict_booleans`), so `yes`, `no`, `on` and `off` stay strings, as in
  `serde_yaml`. Beyond that:
  - YAML tags are dropped and the value kept. The `Tagged` handling in
    `value_is_set` and in the error text is gone.
  - Keys are strings. A scalar key such as `1` or `true` reads as the string
    `"1"` or `"true"`. A list or mapping as a key is a `Malformed` error.
  - `.inf`, `-.inf`, `.nan` and numbers that overflow, such as `1e999`, read
    as strings and the file still loads. In 0.5.1 they were numbers, which
    `serde_json` cannot hold.
  - `<<` is an ordinary key and is not merged, as in 0.5.1.
  - A null key (`~: x`) is an error. Integers beyond `u64` read as lossy
    floats, with no error.
  - Duplicate keys are still an error. The parser limits (`Budget`) are the
    `serde-saphyr` defaults: they cap events, aliases and anchors far above
    any real config file.
- **Breaking:** `file::FileProblem` has a `source` field in place of
  `detail`. `Unreadable { path, source }` holds the `std::io::Error` and
  `Malformed { path, source }` holds the YAML error, or a plain message for an
  empty document or a top level that is not a mapping. The `source` is a
  `Box<dyn std::error::Error + Send + Sync>` that names no YAML crate type;
  downcast it to `std::io::Error` or `serde_saphyr::Error` to look closer. The
  empty and not-a-mapping cases carry only a message.
- **Breaking:** the `Display` text of `FileProblem` names the file and no
  longer ends with `: <cause>`; the cause is the `source`, so a reporter that
  walks the chain prints it once. The YAML error text is also different from
  `serde_yaml`'s, for example `unclosed bracket '[' at line 1, column 6`. An
  error quotes no lines of the file, since a machine file can hold secrets.
  `detail` is gone because the `source` text is the same text.
- **Breaking:** `paths::expand_tokens` is `paths::substitute_path_names` and
  `paths::expand_tokens_with_hint` is `paths::substitute_path_names_with_hint`.
  They replace each `{name}` in a value with the directory `paths:` holds under
  that name. `PathTokens` is `PathNames`, `path_tokens` is `path_names` and
  `TokenError` is `PathNameError`. The error text says "unknown path name"
  where it said "unknown token".
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
  because `serde-saphyr` needs it. The other crates in the workspace moved to
  1.89 with it.

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
