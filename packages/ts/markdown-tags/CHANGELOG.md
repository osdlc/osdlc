# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `tagAt(text, index, dialect)`, one tag by the dialect's character rule, for the renderer and the
  editor.

### Changed

- `obsidian` blanks link and image destinations and reference definitions after code, as the
  crate does, so `[see](#section)` gives no tag.
- `tsconfig.json` sets `erasableSyntaxOnly`, so Node's type stripping can load the source.

## [0.1.0] - 2026-10-11

First cut. The TypeScript twin of the Rust `markdown-tags` crate.

### Added

- `inlineTags` and `extractBoth` in three dialects: `obsidian` (the default),
  `unicode` and `ascii`.
- `TagDialect`, `TAG_DIALECTS`, `DEFAULT_TAG_DIALECT` and `isTagDialect`.
- A suite that reads the crate's shared case file.
