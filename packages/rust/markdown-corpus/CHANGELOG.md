# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-04

The first release: the one corpus model, moved out of determined.

### Added

- `Corpus`: `load`, `refresh`, `apply_changes`, and accessors for paths, body
  links, frontmatter links, notes, backlinks and outbound edges.
- `LinkGraph`: an incremental link graph with backlinks, inbound and outbound
  edges by `EdgeKind` (link, embed, frontmatter), unresolved edges kept,
  `resolve` and `resolve_strict`.
- `FrontmatterIndex`: an incremental parse of every content note's
  frontmatter, with a diagnostic for a note that does not parse.
- `read_note`: reads a note without failing on its frontmatter.
- `TagLexer` and `census` for tags in any syntax.
- All file and clock access goes through `vfs-seam`; the `native` feature
  (on by default) enables the real file system.
