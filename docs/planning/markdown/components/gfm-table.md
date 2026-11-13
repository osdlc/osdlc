---
name: "@osdlc/gfm-table"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.5.0"
registry: "https://www.npmjs.com/package/@osdlc/gfm-table"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/gfm-table
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/gfm-table
twin: "[gfm-pipe-table](gfm-pipe-table.md)"
---

Reads, edits and renders GFM pipe tables as plain strings, and pads columns so the pipes line up.

## Notes

- Its shared test cases still live inside the package. The architecture plans a shared conformance
  family.
