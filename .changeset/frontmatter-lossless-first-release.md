---
'@osdlc/frontmatter-lossless': major
---

The first release on npm, and the start of the stable 1.x line. Version 0.1.0 was used only during development and was never published, so this entry lists everything the package does. It splits a Markdown note into its YAML frontmatter and body, with offsets into the source, and puts it back together byte for byte: the byte-order mark, CRLF line endings and the exact fence bytes are kept. No dependencies. It is the TypeScript twin of the `frontmatter-lossless` Rust crate, held to it by a shared conformance corpus.

- `split(src)` returns a `Split`: `yaml` (verbatim, without the `---` fences, or `null` when the note has no block), `body`, the offsets `yamlRange` (a `SourceRange`) and `bodyStart`, and a `shape` (`NoteShape`) that records the byte-order mark and the line endings of both fences (`OpenEol`, `CloseEol`). A missing or malformed closing fence is not an error: the whole note is body.
- `compose(frontmatter, body, shape)` rebuilds the note; passing back what `split` returned gives the original text byte for byte. New YAML written into a shape taken from an empty block gets its own line, and so does a new body written into a shape taken from a note that ended at its closing fence. Take `NoteShape` from `split` rather than building one: a minor release may add a field.
- `splitLenient(content)` reads hand-written input with leading blank lines or indentation before the opening fence, or trailing spaces on the fence lines. The closing fence must not be indented. It returns a `LenientSplit` (`yaml` and `body`), or `null` when there is no block. It is for reading only.

All nine exports are stable. Node.js 22 or later, ESM only, shipped as compiled JavaScript with type declarations. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.
