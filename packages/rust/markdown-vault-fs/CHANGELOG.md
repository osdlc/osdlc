# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-11-06

A walk can keep going past what it cannot read and say what that was.

### Changed

- `WalkOptions::propagate_errors: bool` is now `WalkOptions::errors:
  Errors` (`vfs-walk`'s, re-exported): `Skip` (the default, was `false`),
  `Propagate` (was `true`) or the new `Report`.
- `WalkOutcome` is no longer `Clone`: its new `errors` field holds
  `VfsError`s, which are not.
- `Admission` has a new variant, `Respelled`: the file system answers for
  the path, but a folder on the way lists it under another spelling
  (another case on a case-insensitive file system, or another Unicode form,
  as on HFS+). Before, such a path was `Unlisted`, so a cache dropped it
  and kept the file under the disk's spelling as it was. A name the file
  system answers for but a folder's listing lacks makes the batch list that
  folder again, once, so a file that came after the listing is still
  `Listed`. A second such name in the same folder and batch is
  `Respelled`, which costs a cache one walk. Below a respelled folder the rest of the path is checked
  as usual, and a respelled path to a file the walk would not list (a
  folder, under `min_bytes`, a refused symlink) is `Unlisted`. The roots,
  `skip_names`, `prune_dirs` and `exclude` still match the path as given.
- `WalkOptions::reads_rules_from` also answers yes for the folder that
  holds the excluded-files list (`.obsidian`), as a watcher reports it on
  its removal or rename.

### Added

- `Errors::Report`: the walk skips what it cannot read, as `Skip` does, and
  `walk_reporting` returns each folder it could not list and each file it
  could not stat in `WalkOutcome::errors`, in the order met. A folder that
  overlapping roots both reach is reported once. A file the walk does not
  list (not collected, or dropped by `min_bytes`) is not reported.
  `WalkOptions::admission` answers under `Report` as under `Skip`.
- `Errors` re-exported from the crate root and `walk`.

## [0.5.0] - 2026-11-04

Built on `vfs-seam` 0.2 and `vfs-walk` 0.2, whose modification times are
nanoseconds.

### Changed

- `Entry::mtime_ms: Option<i64>` is now `Entry::mtime_ns: Option<i64>`,
  nanoseconds since the epoch. `Entry::mtime_ms()` and
  `Entry::mtime_ms_f64()` (node's `mtimeMs`) read it.

### Added

- `WalkOptions::admission(vfs, vault_dir, rel) -> Admission`: what this walk
  makes of `rel`, asked of a path that did not come from a walk. `Outside`:
  the roots, `skip_names`, `prune_dirs`, the visibility, the excluded files,
  `exclude` or notes versus attachments rule it out. `Unlisted`: the path is
  the walk's, but metadata from the vfs says the walk would not list it now
  (gone, under `min_bytes`, a folder, under a symlinked folder or a folder
  that cannot be listed, spelled otherwise than its folder lists it, or a
  symlink when the walk refuses them). It lists each folder from the walk's
  start down, as the walk does. `Listed`: the walk would list it. A file
  that cannot be statted is `Listed` when the walk would list it anyway
  (errors skipped, `min_bytes` 0), as the walk lists it with size 0.
  `WalkOptions::admits` is `admission == Listed`, and
  `WalkOptions::admissions` answers for a list, reading the excluded files
  and each folder's listing once.
- `WalkOptions::reads_rules_from(rel)`: whether `rel` is the excluded-files
  list the walk reads (`.obsidian/app.json` under `Hide::Vault`). A change
  to it can move any path, so a cache walks again.
- `stat::modified_ns` re-exported.

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
