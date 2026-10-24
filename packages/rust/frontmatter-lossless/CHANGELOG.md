# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.1](https://github.com/osdlc/osdlc/compare/frontmatter-lossless/v1.1.0...frontmatter-lossless/v1.1.1) - 2026-10-24

### Other

- plain-language pass over docs and comments ([#444](https://github.com/osdlc/osdlc/pull/444))

## [1.1.0](https://github.com/osdlc/osdlc/releases/tag/frontmatter-lossless/v1.1.0) - 2026-10-21

### Added

- *(frontmatter-lossless)* add the crate for its 1.1.0 release ([#397](https://github.com/osdlc/osdlc/pull/397))

First public release, aligned with @osdlc/frontmatter-lossless 1.1.0 — its
TypeScript twin, the same algorithm and the same conformance corpus. Pure,
byte-exact Markdown frontmatter framing: split a note into verbatim YAML and
body with source byte offsets, and recompose it losslessly. BOM, CRLF and the
exact fence bytes are preserved; a malformed or unterminated block degrades to
body-only. No dependencies beyond std.

### Added

- `split` splits a note into its frontmatter YAML and body, with byte offsets
  into the source and a recorded `NoteShape` (BOM, fence line endings).
  `Split::unterminated` flags a block that opened but never closed; such a note
  is still returned as all body, so a projection never aborts.
- `compose` rebuilds a note from a frontmatter block and a body; handing back
  what `split` returned reproduces the source byte for byte. New YAML or a new
  body always gets its own line.
- `new_shape` builds the `NoteShape` for a new note from `NewShapeOptions`
  (`eol`, `bom`).
- `split_lenient` reads a block from hand-authored input that may carry a
  leading BOM, blank lines or indentation before the opening fence, or trailing
  spaces on the fence lines. It returns a `LenientSplit`, or `None`, and is for
  reading only.
- The types `NoteShape`, `Split`, `LenientSplit`, `NewShapeOptions`, and the
  closed line-ending sets `OpenEol` and `CloseEol`. `NoteShape` and `Split` are
  `#[non_exhaustive]`, so a later field is not a breaking change.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.3.1] - 2026-10-17 (unpublished)

#### Fixed

- `compose` puts new YAML, or a new body, on its own line for the empty-block and
  ends-at-closing-fence shapes, so the next `split` finds the block again.

### [0.3.0] - 2026-10-05 (unpublished)

#### Changed

- Breaking: renamed the crate from `markdown-util` to `frontmatter-lossless` (lib
  `frontmatter_lossless`). Dependents update their dependency and `use` paths.

### [0.2.0] - 2026-10-05 (unpublished)

#### Removed

- Breaking: removed the code-blanking and `#tag` modules; the crate keeps only frontmatter framing.
  Those lexers moved to their own crates.

### [0.1.1] - 2026-07-21 (unpublished)

#### Added

- `split_lenient`, a tolerant read-only split for hand-authored input.

### [0.1.0] - 2026-07-21 (unpublished)

#### Added

- Initial frontmatter framing: `split` and `compose` with byte-exact round trips; BOM, CRLF and
  fence bytes preserved; unterminated blocks degrade to body.
