# @osdlc/markdown-tags

## History before the first release

The package was developed inside another repository before its first release
here. Its first published version is 0.4.0, shared with the Rust crate
`markdown-tags` 0.4.0. What changed on the way, oldest first:

- `inlineTags` and `extractBoth` in three dialects: `obsidian` (the default),
  `unicode` and `ascii`. `TagDialect`, `TAG_DIALECTS`, `DEFAULT_TAG_DIALECT`
  and `isTagDialect`.
- `tagAt(text, index, dialect)`, one tag by the dialect's character rule, for a
  renderer's text node and an editor's inline parser.
- **Breaking:** `obsidian` stops reading a tag inside a link or image
  destination or after a reference definition's `]:`, as the crate does, so
  `[see](#section)` gives no tag. Output for the default dialect changes for
  existing input.
- A suite shared with the Rust crate, `packages/conformance/markdown-tags`.
