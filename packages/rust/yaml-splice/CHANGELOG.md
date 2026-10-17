# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
