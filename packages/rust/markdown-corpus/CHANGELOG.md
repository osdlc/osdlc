# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-04

Callers choose how each cache walks the corpus and how notes are split, and
can see walk errors. Modification times are nanoseconds.

### Changed

- `LoadOptions` is `#[non_exhaustive]`. Build it from
  `LoadOptions::default()` and the `with_` methods (or set fields on it);
  a struct literal no longer compiles.
- `IndexedNote::mtime_ms` is now `IndexedNote::mtime_ns`, nanoseconds since
  the epoch, from `vfs-seam` 0.2. `IndexedNote::mtime_ms_f64()` is node's
  `mtimeMs`. A same-size edit inside one millisecond is now seen.
- `FrontmatterIndex::apply_change` and `LinkGraph::apply_changes` take a path
  only when the cache's walk would list it (`WalkOptions::admits`). With the
  default walks this is what they took before.

### Added

- `LoadOptions::link_walk` and `LoadOptions::frontmatter_walk`
  (`markdown-vault-fs` `WalkOptions`): roots, dot files, pruned folders,
  refused symlinks, propagated errors and the caller's own excluded files
  (`Hide::Rules`). The defaults are the walks as before:
  `LinkGraph::default_walk()` (notes and attachments, `Hide::Off`) and
  `FrontmatterIndex::default_walk()` (content notes, the corpus's excluded
  files). `with_tags`, `with_link_walk`, `with_frontmatter_walk` and
  `with_split` set them.
- `LoadOptions::split` and `SplitMode` (`Strict`, the default, or `Lenient`
  for `frontmatter_lossless::split_lenient`), and `read_note_with(src, mode)`.
  Both caches and `Corpus::read_note` follow it. `NoteBody::read_with` and
  `fill_contexts_with` number lines the same way.
- `Corpus::try_load`, `Corpus::try_refresh` and `Corpus::try_refresh_now`
  return a walk error instead of leaving a cache empty or as it was.
- `LinkGraph::with_walk`, `with_split`, `walk_options`, `split_mode`,
  `try_refresh` and `try_refresh_now`; the same on `FrontmatterIndex`
  (without `split_mode`). Their `refresh` and `refresh_now` leave the cache
  as it was on a walk error, or empty when the call switched corpora.
- `LinkGraph::with_snapshot(|paths, notes| ..)`: every path and every note's
  facts from one lock hold.
- `Hide`, `WalkError`, `WalkOptions` and the `markdown_vault_fs` crate
  re-exported.

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
