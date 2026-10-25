# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.2] - Unreleased

The first release as `markdown-contract`, in step with
`@osdlc/markdown-contract` 0.3.2. The crate has the same finding ids, levels
and line numbers as the package. The shared corpus in
`packages/ts/markdown-contract/corpus/` checks it.

### Added

- The Rust engine: YAML contracts (`mcVersion: 2`), the programmatic contract
  builders, `validate`, and the folder runner (`run_corpus`, and
  `run_corpus_dir` with the `native` feature).
- The `native` feature, on by default. Build with `default-features = false`
  for `wasm32-unknown-unknown`.
- An example, `examples/validate.rs`.
