---
name: skillwright
kind: app
language: rust
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: published
version: "0.12.0"
registry: "https://crates.io/crates/skillwright"
repo_present: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_present: packages/rust/skillwright
repo_target: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_target: packages/rust/skillwright
depends:
  - "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
  - "[markdown-contract-rs](markdown-contract-rs.md)"
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[path-guard-rs](path-guard-rs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
dev_depends:
  - "[vfs-walk](vfs-walk.md)"
edge_notes:
  - edge: depends
    to: "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
    note: Through its tradecraft-core crate.
  - edge: depends
    to: "[markdown-link-rs](markdown-link-rs.md)"
    note: Through its tradecraft-core crate.
  - edge: depends
    to: "[vfs-seam](vfs-seam.md)"
    note: Through its tradecraft-core crate.
  - edge: dev_depends
    to: "[vfs-walk](vfs-walk.md)"
    note: Through its tradecraft-core crate.
  - edge: depends
    to: "[markdown-contract-rs](markdown-contract-rs.md)"
    note: Through its tradecraft-core crate.
---

A CLI that publishes a vault of skill notes into the formats of coding-agent tools, checks them for
drift, and edits and reorganizes the vault.

## Notes

- Uses the osdlc Rust crates from crates.io, through its tradecraft-core crate.
- It no longer uses markdown-corpus, markdown-relink, markdown-vault-fs or etag-write, so task 39
  has nothing to switch in it.
- Its workspace pins frontmatter-lossless 1.1.2 and path-guard 0.3.3, older than the latest.
- It moved out of osdlc/osdlc into osdlc/skillwright.
