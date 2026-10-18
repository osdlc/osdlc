# Changelog

## 1.1.0

### Minor Changes

- 2f3fc7c: Add `newShape(opts?)`, with its options type `NewShapeOptions`: the
  `NoteShape` for a new note, one with no source text to `split`. Both fences
  end in `eol` (`'\n'` by default, or `'\r\n'`), and `bom` (default `false`)
  adds a byte-order mark. `compose(yaml, body, newShape())` gives
  `---\n<yaml>\n---\n<body>`. Pass the YAML text the way `split` returns it,
  without the line break before the closing fence. Until now there was no
  supported way to write a new note, because a `NoteShape` must not be built by
  hand.
- 2f3fc7c: `Split` has a new `unterminated` field. It is `true` when a note starts with a
  valid opening fence (`---` and a line break, after an optional BOM) and no
  closing `---` line follows. `yaml` is still `null` and `body` the whole text,
  as before, so only a caller that wants to report the note as malformed needs
  to read it. Until now such a caller had to repeat the opening-fence check
  itself.

## 1.0.0

### Major Changes

- 727940a: The first release on npm, and the start of the stable 1.x line. Version 0.1.0 was used only during development and was never published, so this entry lists everything the package does. It splits a Markdown note into its YAML frontmatter and body, with offsets into the source, and puts it back together byte for byte: the byte-order mark, CRLF line endings and the exact fence bytes are kept. No dependencies. It is the TypeScript twin of the `frontmatter-lossless` Rust crate, held to it by a shared conformance corpus.
  
  - `split(src)` returns a `Split`: `yaml` (verbatim, without the `---` fences, or `null` when the note has no block), `body`, the offsets `yamlRange` (a `SourceRange`) and `bodyStart`, and a `shape` (`NoteShape`) that records the byte-order mark and the line endings of both fences (`OpenEol`, `CloseEol`). A missing or malformed closing fence is not an error: the whole note is body.
  - `compose(frontmatter, body, shape)` rebuilds the note; passing back what `split` returned gives the original text byte for byte. New YAML written into a shape taken from an empty block gets its own line, and so does a new body written into a shape taken from a note that ended at its closing fence. Take `NoteShape` from `split` rather than building one: a minor release may add a field.
  - `splitLenient(content)` reads hand-written input with leading blank lines or indentation before the opening fence, or trailing spaces on the fence lines. The closing fence must not be indented. It returns a `LenientSplit` (`yaml` and `body`), or `null` when there is no block. It is for reading only.
  
  All nine exports are stable. Node.js 22 or later, ESM only, shipped as compiled JavaScript with type declarations. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.

## History before the first public release

This version was developed in a private repository before the package moved here, and was
never published. It is rebuilt from the git history.

### [0.1.0] - 2026-08-07 (unpublished)

#### Added

- `split(src)` splits a note into `yaml` (verbatim, without the `---` fences, or `null` when the
  note has no block), `body`, the source offsets `yamlRange` and `bodyStart`, and a `shape` that
  records the byte-order mark and the line endings of both fences.
- `compose(frontmatter, body, shape)` rebuilds the note; passing back what `split` returned gives
  the original text byte for byte.
- `splitLenient(content)` reads a block from hand-written input that may have leading blank lines
  or trailing spaces on the fence lines. It returns `{ yaml, body }`, or `null` when there is no
  block. It is for reading only and does not round-trip.
- Types `Split`, `LenientSplit`, `NoteShape`, `SourceRange`, `OpenEol` and `CloseEol`.
- A missing or malformed closing fence is not an error: the whole note is treated as body.
