# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-04

The walk reads through a `vfs-seam` `Vfs`, so it runs on any host, wasm
included, and it applies the vault's excluded files by default. The general
walk moved to the new `vfs-walk` crate; this crate is the vault layer on it.

### Changed

- The traversal is `vfs-walk`'s. The vault rules (visibility, excluded files,
  notes versus attachments, roots) are passed to it as its filter. The walk
  functions and `WalkOptions` keep their shape, and `WalkError` is
  `vfs-walk`'s, with the same variants.
- The `stat` module moved to `vfs-walk` and is re-exported here, with
  `modified_ms`, `ms_since_epoch`, `mtime_ms` and `created_ms`.

- `walk`, `walk_reporting` and `walk_notes` take a `&dyn Vfs` before the vault
  directory. `walk` and `walk_reporting` return `Result<_, WalkError>`; with
  the default options they never fail. The `native` module (default `native`
  feature) has the old one-line forms over the real filesystem:
  `native::walk(dir, opts)`, `native::walk_reporting`, `native::walk_notes`.
- `WalkOptions::hide` is a `Hide`: `Vault` (the default) reads
  `.obsidian/app.json`, `Rules(Arc<HideRules>)` passes your own, `Off` hides
  nothing. Before, the default hid nothing.
- `Entry::mtime: Option<SystemTime>` is now `Entry::mtime_ms: Option<i64>`,
  whole milliseconds from `Vfs::metadata`.
- Names within a folder sort as `String`s (byte order). For UTF-8 names this
  is the order `walkdir` gave.
- `Entry::abs` is the vault directory joined with `rel`.

### Added

- `WalkOptions::refuse_symlinks`, `propagate_errors`, `skip_names` and
  `prune_dirs`, and `WalkError` (`Symlink`, `Io`).
- `hide::load(vfs, vault_dir) -> HideList`, which reads `userIgnoreFilters`
  from `.obsidian/app.json` (moved from determined's `determined-vault`), and
  `hide::parse_app_json`. A missing file is an empty list; a broken one is an
  empty list with `HideList::error` set.
- `stat::modified_ms(vfs, path)`.
- `path::guard(vfs)` and `VfsResolver`: the containment guard over a `Vfs`.
  `Resolver` is re-exported from `path-guard`.
- `vfs_seam` and `vfs_walk` re-exported.

### Removed

- `WalkOptions::follow_links`. A `Vfs` lists a symlinked folder as a file, so
  the walk never follows links.
- The `walkdir` and `thiserror` dependencies.

## [0.3.2](https://github.com/osdlc/osdlc/compare/markdown-vault-fs/v0.3.1...markdown-vault-fs/v0.3.2) - 2026-11-02

### Other

- updated the following local packages: path-guard

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
