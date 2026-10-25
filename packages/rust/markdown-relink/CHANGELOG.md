# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.5] - Unreleased

First public release. A library that renames or moves a note in a Markdown
vault without breaking the links that point at it: it computes a reviewable
rewrite set for every inbound wikilink and relative Markdown link, then applies
it under per-file compare-and-swap.

### Changed

- Every function that takes a `vault_dir` needs an absolute path, because the `path-guard` 0.3
  guard reads no current directory. A relative one is refused with `TransformError::Path`.
  `to_vault_relative` still takes a relative `path` and resolves it against the current directory.

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
