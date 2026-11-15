# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1](https://github.com/osdlc/osdlc/compare/markdown-tags/v0.4.0...markdown-tags/v0.4.1) - 2026-11-10

### Other

- updated the following local packages: markdown-link

## History before the first release

The crate was developed inside another repository before its first release
here. Its first published version is 0.4.0, shared with the TypeScript twin
`@osdlc/markdown-tags` 0.4.0. What changed on the way, oldest first:

### Added

- Inline `#tag` lexer for Markdown note bodies in two dialects,
  `TagDialect::Unicode` and `TagDialect::Ascii`, and `extract_both`.
- `TagDialect::Obsidian`, the default: a Unicode alphabet, at least one
  character that is not a number, code blanked first, and `(` also opens a tag.
  It also blanks link and image destinations and reference definitions after
  code, because a renderer does not read them as text, so `[see](#section)`
  gives no tag.
- `TagDialect` implements `Default` (`Obsidian`), `Display` and `FromStr` over
  the names `obsidian`, `unicode` and `ascii`, and has `ALL` and `as_str`. It
  derives `Hash`, so it can key a cache. A wrong name parses to
  `ParseTagDialectError`.
- `tag_at(text, index, dialect)`, the tag whose `#` is at a byte offset by the
  dialect's character rule alone, as the TypeScript twin's `tagAt`.
- A conformance suite shared with the TypeScript twin,
  `packages/conformance/markdown-tags/suite.json`, with every case's tags in
  all three dialects.

### Changed

- **Breaking:** the two original dialects are named `Unicode` and `Ascii`.
- **Breaking:** the `Obsidian` dialect stops reading a tag inside a link or
  image destination or after a reference definition's `]:`. Output for the
  default dialect changes for existing input.
- `TagDialect` is `#[non_exhaustive]`, so a later dialect is not a breaking
  change.
