# frontmatter-lossless

Split a Markdown note into its YAML frontmatter and its body, with offsets
into the source, and put it back together byte for byte. The byte-order mark,
CRLF line endings and the exact fence bytes are kept. No dependencies beyond
`std`.

## Why

A program that edits a note's frontmatter has to take the note apart and put
it back. The common tools parse the YAML and write it out again, so the
result can differ from the input even when no value changed: a BOM is lost,
`---\r\n` fences become `---\n`, or the YAML is reformatted. In version
control every line of the note then shows as changed.

This crate does only the framing. It finds the `---` block, returns the YAML
text exactly as written, and rebuilds the note from the parts. Hand it back
what it gave you and you get the original text.

It is for programs that read or rewrite notes that people also edit: note
apps, static site generators, linters and sync tools.

When not to use it:

- To read the frontmatter's values. Pass the `yaml` string to a YAML parser.
- For `+++` TOML or `;;;` JSON frontmatter. Only `---` YAML blocks are found.
- To parse the Markdown body. The body is returned as a string.

## Install

```sh
cargo add frontmatter-lossless
```

Rust 1.89 or later (the workspace MSRV), edition 2024.

## Quick start

```rust
use frontmatter_lossless::{compose, split};

let note = "---\r\ntitle: Old\r\n---\r\n# Heading\r\n";

let s = split(note);
assert_eq!(s.yaml, Some("title: Old\r")); // the YAML text, verbatim
assert_eq!(s.body, "# Heading\r\n");

// Change the YAML text however you like, then put the note back.
let new_yaml = s.yaml.unwrap().replace("Old", "New");
let updated = compose(Some(&new_yaml), s.body, s.shape);
assert_eq!(updated, "---\r\ntitle: New\r\n---\r\n# Heading\r\n"); // CRLF fences stay

// Hand back what split gave you and you get the original, byte for byte.
assert_eq!(compose(s.yaml, s.body, s.shape), note);
```

## API

- `split(src)` returns a `Split`: `yaml` (the text between the fences,
  without them, or `None` when the note has no block), `body`, the offsets
  `yaml_range` (a byte range) and `body_start`, and a `shape`. A block is
  found only when the note starts with `---` and a line break, after an
  optional BOM, and is closed by `---` alone on a line. Anything else,
  including a block with no closing fence, is body. It never panics.
  `unterminated` is `true` when the note opens a block that never closes, so
  a caller can report that note as malformed rather than read it as body.
- `compose(frontmatter, body, shape)` rebuilds the note. `frontmatter` is
  `None` for no block, `Some("")` for an empty block, or the YAML text.
  Passing back what `split` returned gives the original text.
- `NoteShape` holds the framing: `bom`, `open_eol` (an `OpenEol`, `Lf` or
  `Crlf`), `close_eol` (a `CloseEol`, which can also be `None` when the note
  ends at the closing fence) and `close_sep`. Take it from `split` and pass it
  to `compose`. Do not build one by hand: it is `#[non_exhaustive]` and a
  minor release may add a field. Build one for a new note with `new_shape`.
- `new_shape(opts)` returns the `NoteShape` for a new note that has no source
  text to split. Its `NewShapeOptions` are `eol` (`OpenEol::Lf` by default,
  or `OpenEol::Crlf`) for both fences and `bom` (`false` by default). Pass the
  YAML text the way `split` returns it, without the line break before the
  closing fence: trim the trailing newline a YAML serializer adds.
- `split_lenient(content)` reads hand-written input that `split` rejects:
  a leading BOM, blank lines or indentation before the opening fence, and
  trailing spaces on the fence lines. The closing fence must not be indented.
  It returns a `LenientSplit` (`yaml` and `body`), or `None` when there is no
  block. It keeps no framing, so use it to read, not to rewrite.

```rust
use frontmatter_lossless::{compose, new_shape, NewShapeOptions};

let yaml = "title: New\ntags: [a]\n"; // as a YAML serializer writes it
let note = compose(
    Some(yaml.trim_end_matches('\n')),
    "# New\n",
    new_shape(NewShapeOptions::default()),
);
assert_eq!(note, "---\ntitle: New\ntags: [a]\n---\n# New\n");
```

Offsets are UTF-8 byte offsets into the source:
`&src[s.yaml_range] == yaml` and `&src[s.body_start..] == s.body`.

```rust
use frontmatter_lossless::split_lenient;

let ls = split_lenient("\n---  \ntitle: A\n---\nbody\n").unwrap();
assert_eq!((ls.yaml, ls.body), ("title: A", "body\n"));
assert!(split_lenient("no frontmatter\n").is_none());
```

Each item has Rustdoc in the source. Your editor shows it, and `cargo doc`
builds it.

## How it compares

Several Rust crates read frontmatter. They parse the block into values. This
crate does not: it returns the YAML text verbatim with byte offsets and
rebuilds the note from the parts, so a round trip is byte-exact. That is a
different job.

- `frontmatter` wraps `yaml-rust` and hands back parsed data. It is a
  value-level parser, not byte-exact framing.
- `frontmatter-gen` parses YAML, TOML and JSON frontmatter into a typed value.
- `markdown-frontmatter` parses the block and deserializes it with `serde`.
- `pulldown-cmark-frontmatter` extracts frontmatter while parsing Markdown
  with `pulldown-cmark`.
- `mif-frontmatter` parses a frontmatter block into values.

Use one of those when you want the values. Use this crate when the note must
come back unchanged. To edit single YAML values in place, keeping comments and
key order, run a YAML editor on the `yaml` string, then `compose` the result.
This crate is the layer under such an editor.

## Twin

`@osdlc/frontmatter-lossless` is the TypeScript twin: the same algorithm and
the same conformance corpus. Its offsets are UTF-16 code units; this crate's
are UTF-8 bytes.

## Stability

Every public item is stable from 1.0.0. A breaking change needs a new major
version and is listed in the CHANGELOG under "Breaking". `NoteShape` and
`Split` are `#[non_exhaustive]`, so a later minor release can add a field
without breaking callers. There are no experimental items.

## Runtimes and platforms

Any platform Rust supports, tested on Linux and macOS. The code is pure `std`
string handling with no file system or platform code.

## License

`MIT OR Apache-2.0`, at your option.
