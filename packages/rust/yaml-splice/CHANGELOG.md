# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1](https://github.com/osdlc/osdlc/releases/tag/yaml-splice/v0.2.1) - 2026-10-17

First release on crates.io. Earlier versions, including an internal 0.2.1, were
not published.

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
