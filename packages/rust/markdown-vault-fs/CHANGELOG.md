# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.1] - Unreleased

First public release. Filesystem primitives for a folder of Markdown notes (a "vault"): a
visibility-policy walk, a compiled excluded-files matcher, the `_system/` path rules, Node-shaped
`statSync` timestamps, and a re-exported path-containment guard. Nothing here parses YAML or
Markdown. Versions 0.1.0 to 0.3.0 below were never published.

### Added

- `HideRules`: a vault's excluded-files list in Obsidian's `userIgnoreFilters` syntax
  (case-insensitive path prefix, or a case-insensitive `/.../` regular expression), compiled and
  matched; applied by the walk through `WalkOptions::hide`.
- A vault walk under a visibility policy (`Visibility`: `ContentNotes`, `IncludingUnderscore`,
  `Everything`), with optional root scoping and optional hide rules. `walk`, `walk_notes` and
  `walk_reporting` return entries vault-relative, in a stable tree order; `WalkOptions` chooses
  whether notes or attachments are collected.
- File timestamps as the millisecond floats Node's `statSync()` reports (`created_ms`, `mtime_ms`,
  `ms_since_epoch`), computed with Node's exact arithmetic so a cache keyed on an exact float match
  does not see false changes.
- The `_system/` path rules (`SYSTEM_PREFIX`, `is_system_path`, `system_route`), matched
  case-insensitively.
- The `path-guard` 0.3 containment guard, re-exported under `markdown_vault_fs::path`: `Guard`,
  `PathError` and the `lexical` module. `Guard`, `PathError`, `SYSTEM_PREFIX`, `is_system_path`
  and `system_route` are also at the crate root.
- A relative vault root passed to `walk`, `walk_notes` and `walk_reporting` is made absolute
  first, so it walks the same as an absolute one.

### Fixed

- The walk works on Windows. It keyed each entry with a POSIX-only text check, so on Windows it
  dropped every file and returned an empty result.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.3.0] - 2026-10-06 (unpublished)

#### Changed

- Breaking: the path-containment guard moved into its own crate, `path-guard`, and is re-exported
  under `markdown_vault_fs::path`. The guard's types now come from `path-guard`.

### [0.2.0] - 2026-10-05 (unpublished)

#### Changed

- Breaking: the crate was renamed to `markdown-vault-fs`. Change the dependency name and the
  import paths.

### [0.1.0] - 2026-08-23 (unpublished)

#### Added

- A vault walk under a visibility policy, with optional root scoping.
- File timestamps as the millisecond floats Node's `statSync()` reports, computed with Node's exact
  arithmetic so a cache keyed on an exact float match does not see false changes.
- The `_system/` path rules, matched case-insensitively, and a containment guard for
  client-supplied vault-relative paths.
