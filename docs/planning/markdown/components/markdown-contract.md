---
name: "@osdlc/markdown-contract"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.7.7"
registry: "https://www.npmjs.com/package/@osdlc/markdown-contract"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-contract
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-contract
twin: "[markdown-contract-rs](markdown-contract-rs.md)"
depends:
  - "[gfm-table](gfm-table.md)"
---

Checks the structure of one document against a contract: its frontmatter, heading sections, tables,
lists and code blocks. Then reads it as a typed model.

## Notes

- Its shared test cases still live inside the package. The architecture plans a shared conformance
  family for it.
