---
name: "@osdlc/markdown-tags"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.4.0"
registry: "https://www.npmjs.com/package/@osdlc/markdown-tags"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-tags
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-tags
twin: "[markdown-tags-rs](markdown-tags-rs.md)"
links:
  - "[osdlc/osdlc#714](https://github.com/osdlc/osdlc/pull/714)"
depends:
  - "[markdown-link](markdown-link.md)"
---

Finds inline #tags in a note body, in three dialects: Obsidian's rule (the default), a Unicode one
and an ASCII one.

## Notes

- Moved into osdlc in osdlc/osdlc#714. Shares the markdown-tags conformance family with the Rust
  crate.
- The plan says markdown-tags is on neither registry yet. That is out of date: 0.4.0 is on npm and
  on crates.io.
