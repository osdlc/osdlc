---
name: "@osdlc/yaml-splice"
kind: package
language: ts
layer: "[formats](../layers/formats.md)"
states: [present, target]
status: published
version: "0.3.1"
registry: "https://www.npmjs.com/package/@osdlc/yaml-splice"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/yaml-splice
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/yaml-splice
depends:
  - "[yaml-splice-wasm](yaml-splice-wasm.md)"
edge_notes:
  - edge: depends
    to: "[yaml-splice-wasm](yaml-splice-wasm.md)"
    note: "Its build:wasm script builds the wasm crate; the package ships the result."
---

Edits top-level YAML fields in place and keeps every other byte, comments included. It is the Rust
crate built to WebAssembly for Node.js and Bun.

## Notes

- It is a binding, not a twin: one crate built for another runtime, with no tests of its own.
- It edits any YAML mapping, not only frontmatter. Frontmatter is its main use today:
  frontmatter-lossless splits the note, and yaml-splice edits the YAML part.
