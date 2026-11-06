# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-06

A load can keep going past a folder it cannot list or a note it cannot
read and say what it passed over, and the link graph can list notes it
never reads. Built on `markdown-vault-fs` 0.6.

### Changed

- The walks take `markdown-vault-fs` 0.6's `WalkOptions::errors: Errors`
  in place of `propagate_errors: bool`. `Errors` is re-exported.
- The walk's `errors` now covers a note the cache lists but cannot read.
  Under `Errors::Propagate` that fails the sweep (and `Corpus::try_load`);
  before, the note got empty facts, as it still does under `Errors::Skip`.
  An apply that meets such an error, or a file it cannot stat, marks the
  cache stale, so the next refresh walks and fails; until one succeeds the
  cache takes no applies, as after any stale mark.
- A path that is not there is not an error under any policy: a file gone
  between its listing and its stat, a note gone since the walk, or a
  dangling symlink. A note keeps empty facts until the next sweep drops it
  or its target arrives. The walk's `NotFound` for the corpus folder itself
  is still reported.
- A note that cannot be read is never fresh, in both caches, so every
  sweep tries it again. Before, it was stamped like a note that was read,
  and a note made readable again without a change to its size or time
  kept its empty facts. A note that still cannot be read counts as
  unchanged, so it does not rebuild the graph or move
  `FrontmatterIndex::changes`. A dangling symlink, which was counted as
  updated on every sweep, now counts as unchanged too.
- `refresh` and `refresh_now`, on both caches, report a failed walk as the
  cache stands (every note `unchanged`, and `resolvable` on the graph), as
  a reused sweep does. Before, they reported all zeros while the cache
  still held its notes. A failed walk now also leaves the cache stale, so
  the next refresh walks again instead of reusing the last good sweep
  inside the TTL.
- An apply that names a path its folder lists under another spelling
  (`Admission::Respelled`) drops it, as before, and now marks the cache
  stale, so the next refresh walks and reads the file by the disk's
  spelling. Before, an edit a watcher reported in another Unicode form or
  case was lost until the TTL ran out. The old name after a case-only
  rename on a case-insensitive file system is respelled too, so such a
  rename costs one walk.
- A change reported for the `.obsidian` folder itself marks a cache whose
  walk reads `.obsidian/app.json` stale, as a change to the file does.
- The docs of `Note::shape` and `read_note_with` say what the strict
  framing means under `SplitMode::Lenient`: for an oddly fenced note where
  the two splits end the block at different fences, it frames the strict
  block, not the one read, so a writer splits strictly.

### Added

- `Errors::Report` in a cache's walk: the sweep skips what it cannot read,
  as `Skip` does, and keeps each folder it could not list, each file it
  could not stat and each note it listed but could not read, once per path.
  `LinkGraph::unreadable()`, `FrontmatterIndex::unreadable()` and
  `Corpus::unreadable()` (both caches, each path once) return them. An
  entry for a path the cache lists is a file or note; any other is a folder.
  An apply replaces the entries for the files it names with the stat and
  read errors it met. A folder's entry clears on the next sweep, and an
  apply does not report a folder that can no longer be listed.
- `LinkGraph::with_list_only(|rel| ..)`: notes the predicate picks are
  listed, as files a link resolves to, but never read, so they have no
  facts or edges. For a caller that needs the paths under dot-named
  tooling folders but not their links.

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
- `FrontmatterIndex::apply_change` and `LinkGraph::apply_changes` ask the
  cache's walk about each path (`WalkOptions::admission`). A path outside the
  walk is ignored, as before. A path the walk would not list now (gone, under
  `min_bytes`, a folder, a refused symlink, under a symlinked folder) is
  dropped from the cache; before, only a gone file was. A path the walk
  lists is kept, as the sweep keeps it, even when it cannot be stamped
  through a symlink (a dangling link, a link to a folder); before, an apply
  dropped it until the next sweep. The admissions are read under the apply
  lock, so a batch never installs what it read before a later batch.
- An apply drops a path under a folder that cannot be listed, as the sweep
  never sees it, and a path its folder lists with different case. Before, the
  frontmatter index kept the old spelling of a case-only rename on a
  case-insensitive file system until the next sweep, and both caches kept a
  file under a folder that could be searched but not listed.
- An applied change to the excluded-files list a cache's walk reads
  (`.obsidian/app.json` under `Hide::Vault`, the frontmatter index's
  default) marks that cache stale, so the next refresh walks. Before, it
  was ignored as outside the walk, and newly excluded files stayed until
  the TTL ran out.
- A switch to another corpus that empties a cache now moves
  `LinkGraph::rebuilds` and `FrontmatterIndex::changes`, also when the new
  corpus is empty or its walk fails.
- `FrontmatterIndex::clear` moves `FrontmatterIndex::changes` when it empties
  the index. Before, a cache keyed on `changes` kept the cleared entries.
- The free function `fill_contexts(vfs, root, backlinks)` is now the method
  `LinkGraph::fill_contexts(vfs, root, backlinks)`, with
  `Corpus::fill_contexts(vfs, backlinks)` on top, which passes its own root.
  It splits each note as the graph does, so a lenient corpus gets the right
  lines. The root is passed in, so a graph shared across corpora never fills
  a page from the wrong one.

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
  Both caches, `Corpus::read_note` and `LinkGraph::fill_contexts` follow it.
  `NoteBody::read_with` numbers lines the same way.
- `split_with(src, mode)`: a note's frontmatter text and body as both caches
  split it; the body is a suffix of `src`. For a tool that splices at the
  spans the caches found.
- `Corpus::try_load`, `Corpus::try_refresh` and `Corpus::try_refresh_now`
  return a walk error instead of leaving a cache empty or as it was. Both
  caches are refreshed even when the first walk fails.
- `LinkGraph::with_walk`, `with_split`, `walk_options`, `split_mode`,
  `try_refresh` and `try_refresh_now`; the same on `FrontmatterIndex`
  (without `split_mode`). Their `refresh` and `refresh_now` leave the cache
  as it was on a walk error, or empty when the call switched corpora.
- `LinkGraph::with_snapshot(|paths, notes| ..)`: every path and every note's
  facts from one lock hold.
- `LinkGraph::snapshot()` (and `Corpus::snapshot()`) returns a
  `LinkSnapshot`: the paths, body links and frontmatter links from one sweep.
  `LinkGraph::body_links()` and `LinkGraph::frontmatter_links()` are the
  maps `Corpus` already had; the `Corpus` methods now call them.
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
