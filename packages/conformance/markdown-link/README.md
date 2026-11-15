# markdown-link

Find the links in a markdown note: wikilinks, embeds and relative markdown
links, with their spans, outside code. The family also holds the code lexer
that decides what is code, the parsers for one link, `display_text` and
`parse_typed_ref`.

| Implementation | Language | Directory |
|---|---|---|
| `markdown-link` (reference) | Rust | `packages/rust/markdown-link` |
| `@osdlc/markdown-link` | TypeScript | `packages/ts/markdown-link` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Offsets count characters, so neither language's string unit
leaks into the file. Write a new case's `input` by hand, then run

```sh
cd packages/rust
cargo run -p markdown-link --example conformance-write
```

to write its `expect`. Never write that by hand.

A body case may set `options`: `code_rules` (`commonmark`, `skill-export` or
`none`), `skip_html_comments` and `self_links`. A key a link does not have
(`heading`, `block`, `size`) is left out of its `expect`.

Resolution against a vault (`LinkIndex`) is not in the suite. The Rust crate
covers it with its differential test.
