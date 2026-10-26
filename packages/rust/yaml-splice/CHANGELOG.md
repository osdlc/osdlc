# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- A signed `0x` / `0o` scalar (`-0x1F`, `+0o7`) now reads as a string, as
  yaml@2's core schema reads it. Before, it read as an integer.
- A `0x` / `0o` scalar too wide for `i64` (`0xFFFFFFFFFFFFFFFF`) now reads as
  a number (`Value::Float`, the nearest `f64`), as yaml@2 reads it. Before, it
  read as a string, so such a top-level key is no longer addressable as a
  string key. The emitter already quoted such a string, and now decides what
  to quote with the parser's own resolver, so what it leaves plain is exactly
  what `parse` reads as a string.

### Fixed

- `splice_keys` with a key named more than once writes it once, at the key's
  first position, with the last edit winning. Before, the output was corrupted.
- A collection that `splice_keys` writes into a CRLF block is written with
  CRLF line endings, instead of adding lone LF lines.

## [0.3.2](https://github.com/osdlc/osdlc/compare/yaml-splice/v0.3.1...yaml-splice/v0.3.2) - 2026-10-24

### Other

- plain-language pass over docs and comments ([#444](https://github.com/osdlc/osdlc/pull/444))

## [0.3.1](https://github.com/osdlc/osdlc/compare/yaml-splice/v0.3.0...yaml-splice/v0.3.1) - 2026-10-22

### Other

- *(changelog)* correct the MSRV notes for path-guard and its siblings ([#398](https://github.com/osdlc/osdlc/pull/398))

### Changed

- The minimum supported Rust version is 1.89, up from 1.85. The whole workspace
  moved together; slug-collate and config-layers (through `serde-saphyr`) need
  1.89.

## [0.3.0] - 2026-10-18

### Changed

- `serde_json` is now an optional dependency, behind the `serde_json` feature.
  The feature is on by default and gates `impl From<&serde_json::Value> for
  Value`, the only code that uses it. A build with `default-features = false`
  no longer has that impl. This is why the version is 0.3.0.

### Fixed

- The `EditError::UnrenderableValue` docs no longer give a folded block scalar
  as an example cause. The edit functions render at `line_width` 0, where the
  emitter cannot fail, so this release never returns the variant. The docs now
  say so.

## [0.2.3](https://github.com/osdlc/osdlc/compare/yaml-splice/v0.2.2...yaml-splice/v0.2.3) - 2026-10-19

### Added

- *(slug-collate)* add slug-collate 0.1.1 for its first crates.io release ([#294](https://github.com/osdlc/osdlc/pull/294))

## [0.2.2](https://github.com/osdlc/osdlc/compare/yaml-splice/v0.2.1...yaml-splice/v0.2.2) - 2026-10-17

### Other

- restore the CHANGELOG history from before the packages moved here

## [0.2.1](https://github.com/osdlc/osdlc/releases/tag/yaml-splice/v0.2.1) - 2026-10-17

First release on crates.io. Versions 0.1.0 and 0.2.0, and an earlier 0.2.1
(2026-10-06, packaging changes only, no API change), were developed in a private
repository before the package moved here, and were not published. This 0.2.1
includes the changes made since then.

### Added

- `edit_yaml` and `edit_yaml_with`: apply an ordered batch of `FieldEdit`s
  (`Set`, `Remove`, `Rename`) to the top-level keys of a YAML document,
  changing only the edited field's bytes. An edit that changes nothing returns
  the input bytes. Keys match case-insensitively unless
  `EditOptions::case_sensitive` is set.
- `edit_frontmatter` and `edit_frontmatter_with`: the same for a Markdown
  frontmatter block in split form (no final line ending).
- `EditError`: every refusal as a value, with byte spans where known. An edit
  whose result would not parse, would change a key it does not address, or
  would not read back as asked, is refused as `InvalidResult`.
- `Value` and `Mapping`: an insertion-ordered value model, with a conversion
  from `serde_json::Value`.
- `parse`, `render` and `splice` modules (unstable): the span-keeping parser,
  the value emitter that matches the npm `yaml` package (version 2), and the
  older single-key splice functions.
- `FieldEdit`, `EditError`, `EditOptions`, `EditOutcome` and the other error
  and option types are `#[non_exhaustive]`.
- Minimum supported Rust version 1.85.

## [0.2.0] - 2026-08-08

Developed in a private repository before the package moved here. Not published.

### Changed

- **BREAKING:** `splice_key` returns the split form on every path; previously it
  returned the file-line form (trailing newline) when appending a key and the
  split form when replacing one.

## [0.1.0] - 2026-07-21

Developed in a private repository before the package moved here. Not published.

### Added

- Initial release: the pure YAML frontmatter field-editing crate.
