---
name: markdown-relink
kind: crate
language: rust
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present, target]
status: published
version: "0.4.0"
registry: "https://crates.io/crates/markdown-relink"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-relink
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-relink
links:
  - "[osdlc/osdlc#651](https://github.com/osdlc/osdlc/pull/651)"
depends:
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[markdown-corpus-rs](markdown-corpus-rs.md)"
  - "[markdown-vault-fs](markdown-vault-fs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[etag-write-rs](etag-write-rs.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
---

Moves or renames a note and rewrites the links that point at it, as a plan you can review before it
is applied.

## Notes

- Its code still says vault (VaultFacts).
- Open release PR osdlc/osdlc#730 would bump it to 0.4.1.
- Open osdlc/osdlc#651 also touches it.
