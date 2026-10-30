# frontmatter-lossless

Byte-exact Markdown frontmatter framing: split a note into its verbatim YAML
and body, with offsets into the source, and compose it back byte for byte. A
byte-order mark, CRLF fences and a note that ends at its closing fence are
kept. A missing closing fence reads as body. The family also has a lenient,
read-only split and the shape for a new note.

| Implementation | Language | Directory |
|---|---|---|
| `frontmatter-lossless` (reference) | Rust | `packages/rust/frontmatter-lossless` |
| `@osdlc/frontmatter-lossless` | TypeScript | `packages/ts/frontmatter-lossless` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Offsets are UTF-8 bytes; the TypeScript runner converts its
UTF-16 indices before comparing. Write a new case's `input` by hand, then run

```sh
cd packages/rust
cargo run -p frontmatter-lossless --example conformance-write
```

to write its `expect`. Never write that by hand.

Besides the stored values, both runners check that a strict split composes
back to its source, that the offsets index the source, that an unterminated
note has no block, and that composed text splits back to what went in.
