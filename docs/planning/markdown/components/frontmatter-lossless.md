---
name: "@osdlc/frontmatter-lossless"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "1.1.2"
registry: "https://www.npmjs.com/package/@osdlc/frontmatter-lossless"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/frontmatter-lossless
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/frontmatter-lossless
twin: "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
---

Splits a note into its YAML frontmatter and body, and puts them back together byte for byte.

## Notes

- A general library, not one the plan owns: detect-harness depends on it
  ([D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md)).
- Shares the frontmatter-lossless conformance family with the Rust crate, which is the reference.
