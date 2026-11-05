# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-04

The first release on crates.io. 0.3.2 below was never published.

### Added

- `select`: pick part of a note the way an Obsidian link fragment does.
  `heading` and `heading_range` read a selector (`Heading`, `Parent#Child`,
  or a heading whose text holds `#`), `heading_path` and `heading_path_range`
  a path already split, `block` and `block_range` a `^block-id`, and
  `fragment` and `fragment_range` any of these or none. `atx_heading` reads
  one heading line. Every heading counts, the first H1 included, and a
  heading inside fenced code does not.
- `DocTree::section_by_heading_path`, `DocTree::section_by_selector` and
  `DocTree::block_range_by_id`, the same selection on a parsed document, as a
  byte range in `DocTree::body`.
- `DocTree::block_by_id` and `SectionNode::block_by_id`: the projected block
  bound to a `^block-id`.
- `BlockNode::range()`: a block's bytes in `DocTree::body`.
- A dependency on `markdown-link`, whose fence lexer `select` uses.

### Changed

- Breaking: `SectionNode` has a new public field, `range`, and each
  `BlockNode` variant a new field, `range`, so code that builds them with a
  struct literal must set it. `range` is the bytes of the section (its
  heading line to the next heading that closes it) or block in
  `DocTree::body`; the root section's range is the whole body.

### Fixed

- Under strict order, an unknown section no longer makes a later optional
  section, or a repeat of a filled repeatable section, `structure/section-order`,
  with or without a `gap()` ahead. A declared section for a slot that unknown
  sections skipped sends the check back to where they started, unless a declared
  section has filled a slot since. Under `allow_unknown: true` a gap no longer
  counts those unknown sections. Under `allow_unknown: false` the walk goes back
  only when no gap took them. This matches the `@osdlc/markdown-contract` fix,
  and corpus fixtures v39 and v39a cover it in both engines.

## [0.3.2] - Unreleased

The first release as `markdown-contract`, in step with
`@osdlc/markdown-contract` 0.3.2. The shared corpus in
`packages/ts/markdown-contract/corpus/` checks the crate against the package:
for every fixture YAML can express, the same number of findings, the same ids
in order, and the same level, line and hint where a fixture records them. The
README lists what the crate does not share with the package.

### Added

- The Rust engine: YAML contracts (`mcVersion: 2`), the programmatic contract
  builders, `validate`, and the folder runner (`run_corpus`, and
  `run_corpus_dir` with the `native` feature).
- The `native` feature, on by default. Build with `default-features = false`
  for `wasm32-unknown-unknown`.
- `extract_vault_refs`, which lists the wikilinks and embeds in a text.
- An example, `examples/validate.rs`.
