---
name: vfs-walk
kind: crate
language: rust
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.2.1"
registry: "https://crates.io/crates/vfs-walk"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/vfs-walk
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/vfs-walk
depends:
  - "[vfs-seam](vfs-seam.md)"
---

A sorted walk of a folder tree through vfs-seam, with skip lists and a symlink policy. It knows
nothing about Markdown.
