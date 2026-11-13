---
name: markdown-relink
kind: crate
language: rust
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present]
status: retiring
version: "0.4.0"
registry: "https://crates.io/crates/markdown-relink"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-relink
tasks:
  - "[39 Rename relink](../tasks/39%20Rename%20relink.md)"
links:
  - "[osdlc/osdlc#651](https://github.com/osdlc/osdlc/pull/651)"
depends_going:
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[markdown-corpus-rs](markdown-corpus-rs.md)"
  - "[markdown-vault-fs](markdown-vault-fs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[etag-write-rs](etag-write-rs.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
---

Moves or renames a note and rewrites the links that point at it, as a plan you can review before it
is applied.

The plan renames it markdown-reshape. This crate retires under the old name.

## Notes

- Renamed to markdown-reshape-rs, the same library under the new name (task 39). The owner
  deprecates this crate on crates.io once the new name is published.
- Its code still says vault (VaultFacts).
- Open release PR osdlc/osdlc#730 would bump it to 0.4.1.
- Open osdlc/osdlc#651 also touches it.
