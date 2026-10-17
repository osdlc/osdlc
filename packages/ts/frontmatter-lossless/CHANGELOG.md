# Changelog

## History before the first public release

These versions were developed in a private repository before the package moved here, and were
never published. They are rebuilt from the git history.

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
