# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `TagDialect::Obsidian`, the rule of the `@sksizer/markdown-render` renderer: a Unicode alphabet,
  at least one character that is not a number, code blanked first, and `(` also opens a tag. It also
  blanks link and image destinations and reference definitions, which the renderer does not read as
  text, so `[see](#section)` gives no tag.
- `TagDialect` implements `Default` (`Obsidian`), `Display` and `FromStr` over the names
  `obsidian`, `unicode` and `ascii`, and has `ALL` and `as_str`. It derives `Hash`, so it can key
  a cache. A wrong name parses to
  `ParseTagDialectError`.
- `tests/fixtures/conformance.json`, a case file with every case's tags in all three dialects. The
  TypeScript twin `@sksizer/markdown-tags` reads it too.

## [0.1.0] - 2026-10-06

### Added

- Inline `#tag` lexer for Markdown note bodies in two dialects, `TagDialect::Unicode` and
  `TagDialect::Ascii`, moved out of the monorepo's Rust libraries into its own crate
  ([#2807](https://github.com/sksizer/dev/pull/2807)).
