---
name: markdown-vault-fs
kind: crate
language: rust
layer: "[files](../layers/files.md)"
states: [present, target]
status: published
version: "0.6.0"
registry: "https://crates.io/crates/markdown-vault-fs"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-vault-fs
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-vault-fs
links:
  - "[osdlc/osdlc#650](https://github.com/osdlc/osdlc/pull/650)"
depends:
  - "[path-guard-rs](path-guard-rs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[vfs-walk](vfs-walk.md)"
---

Walks a folder of notes: tells notes from attachments, applies the skip rules (including Obsidian's
excluded files) and guards paths.

## Notes

- Its name still says vault. Decision D1 says vault names move to corpus over time; the plan names
  no new name.
- Open release PR osdlc/osdlc#730 would bump it to 0.6.1.
- Open osdlc/osdlc#650 changes it (edge cases from earlier reviews). It still targets the branch of #648,
  which merged on 2026-11-08, and assumes 0.6.0 is unreleased, but 0.6.0 is on crates.io.
