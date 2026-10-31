# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
