# markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects: `obsidian`
(the default; Obsidian's rule, with code, link destinations and reference
definitions blanked first), `unicode` (every Unicode letter and number, and
code is scanned) and `ascii` (ASCII names, code blanked, a tag may follow
`(`). Each dialect's rule is stated in the Rust crate's docs.

| Implementation | Language | Directory |
|---|---|---|
| `markdown-tags` (reference) | Rust | `packages/rust/markdown-tags` |
| `@osdlc/markdown-tags` | TypeScript | `packages/ts/markdown-tags` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Tags come back without the `#`, in the order they appear and
not deduplicated. Write a new case's `input` by hand, then run

```sh
cd packages/rust
cargo run -p markdown-tags --example conformance-write
```

to write its `expect`. Never write that by hand.

## Sections

- `inline_tags`: the tags found in a body under all three dialects. Both
  implementations run every case, and check that `extract_both` /
  `extractBoth` agrees with the `unicode` and `ascii` answers.
- `renderer_only`: the tags a renderer shows where it reads the syntax tree
  and a source scan cannot match it: markup right before a `#`
  (`**bold**#tag`), a decoded entity (`a&nbsp;#tag`), and link text. Neither
  library runs this section; a renderer does (`@osdlc/markdown-render` reads
  it). Its `expect` values are the renderer's, so the generator keeps them as
  written.
