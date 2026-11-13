---
name: gfm-pipe-table
kind: crate
language: rust
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: unpublished
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/gfm-pipe-table
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/gfm-pipe-table
twin: "[gfm-table](gfm-table.md)"
---

The Rust twin of @osdlc/gfm-table.

## Notes

- A general library, not one the plan owns, like its twin, which config-layers depends on
  ([D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md)).
- It is publish = false, so it is not on crates.io.
