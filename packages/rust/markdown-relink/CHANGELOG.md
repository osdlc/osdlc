# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-04

Built on `markdown-corpus` 0.2, `markdown-link` 0.8 and `vfs-seam` 0.2.

### Added

- `VaultFacts::from_graph(&markdown_corpus::LinkGraph)`: the snapshot from a
  link graph alone, read under one lock hold so the paths and links come from
  one sweep. `from_corpus` now goes through it.
- `VaultFacts::split`: how the notes were split when the links were found,
  the graph's `split_mode()` in `from_graph` and `from_corpus`. The planner
  re-scans each note it edits with this split, so with a lenient corpus a
  link in a block only the lenient split takes is a frontmatter value in both
  the snapshot and the plan, and is not rewritten.

### Changed

- `VaultFacts` has a new public field, `split`; a struct literal must set it
  or use `..VaultFacts::default()` (`Strict`).
- No longer depends on `frontmatter-lossless`; the split comes from
  `markdown_corpus::split_with`.

## [0.2.0] - 2026-11-04

Planning reads the vault through a `vfs-seam` `Vfs`, and the vault snapshot
comes from the shared `markdown-corpus` model.

### Changed

- `plan`, `plan_redirect` and `plan_bundle` take a `&dyn Vfs` first. Pass
  `&vfs_seam::NativeVfs` for the real filesystem. `bundle_members` takes one
  too. `execute` and `execute_bundle` are unchanged: they write through
  `etag-write`'s compare-and-swap on the real filesystem.
- `VaultFacts::scan` loads a `markdown_corpus::Corpus` and calls `from_corpus`.
  Its frontmatter references now also hold plain file-path values (for
  example `cover: img/a.png`), not only wikilinks; they are reported, never
  rewritten. `paths` is sorted by `slug_collate::compare_paths`.

### Added

- `VaultFacts::from_corpus(&markdown_corpus::Corpus)`.
- `vfs_seam` re-exported.

## [0.1.10](https://github.com/osdlc/osdlc/compare/markdown-relink/v0.1.9...markdown-relink/v0.1.10) - 2026-11-01

### Other

- updated the following local packages: frontmatter-lossless, markdown-link

## [0.1.9](https://github.com/osdlc/osdlc/compare/markdown-relink/v0.1.8...markdown-relink/v0.1.9) - 2026-10-31

### Other

- updated the following local packages: markdown-link

## [0.1.8](https://github.com/osdlc/osdlc/compare/markdown-relink/v0.1.7...markdown-relink/v0.1.8) - 2026-10-30

### Changed

- Depend on slug-collate 0.2. slug-collate 0.1.2 was yanked, and this
  crate's earlier releases require it. Only `compare_paths` is used, and its
  order is unchanged, so behaviour is the same.

## [0.1.7](https://github.com/osdlc/osdlc/compare/markdown-relink/v0.1.6...markdown-relink/v0.1.7) - 2026-10-29

### Other

- updated the following local packages: markdown-link

## [0.1.6](https://github.com/osdlc/osdlc/compare/markdown-relink/v0.1.5...markdown-relink/v0.1.6) - 2026-10-28

### Other

- updated the following local packages: yaml-splice, markdown-link

## [0.1.5] - Unreleased

First public release. A library that renames or moves a note in a Markdown
vault without breaking the links that point at it: it computes a reviewable
rewrite set for every inbound wikilink and relative Markdown link, then applies
it under per-file compare-and-swap.

### Changed

- Every function that takes a `vault_dir` needs an absolute path, because the `path-guard` 0.3
  guard reads no current directory. A relative one is refused with `TransformError::Path`.
- `TransformError` and `DiagnosticCode` are `#[non_exhaustive]`. A `match` on either needs a
  `_` arm, and a new variant is no longer a breaking change.
- A bundle whose entry file fails to rename after its directory moved is reported with the
  stable `Skip.reason` `entry_rename_failed`. The filesystem error is in
  `RenameResult::conflict`, not in the reason.

### Removed

- The planner's internals are no longer public: `PathMap`, `Corpus`, `Resolution`,
  `rewrite::LinkOutcome`, `rewrite::target_span`, `rewrite::plan_link` and
  `rewrite::encode_md_url`. `splice`, `bundle::bundle_entry` and `bundle::bundle_members`
  stay public.
- `to_vault_relative`. It had no caller outside the crate and none inside it.

### Fixed

- Reading failures from the etag layer surface as errors rather than empty
  results.

## History before the first public release

These versions were never published. They are rebuilt from the development
history. They carry no release tags.

### [0.1.4] - 2026-10-11 (unpublished)

#### Fixed

- A destination reached through a dangling symlink reduces to where its target
  would land; a path outside the vault is refused.

### [0.1.3] - 2026-10-06 (unpublished)

#### Fixed

- A backslash before a table-cell alias pipe is kept as an escape on rewrite.

### [0.1.2] - 2026-09-29 (unpublished)

#### Added

- `plan_redirect`: point a doomed note's inbound links at a copy that stays.

### [0.1.1] - 2026-09-29 (unpublished)

#### Fixed

- Resolution follows relative links and frontmatter references under
  underscore-prefixed folders.

### [0.1.0] - 2026-09-18 (unpublished)

#### Added

- Initial library: rename or move a note and rewrite every inbound wikilink and
  relative Markdown link. `plan` previews, `execute` applies under per-file
  compare-and-swap, `plan_bundle`/`execute_bundle` move a `<name>/<name>.md`
  folder with its peers.
