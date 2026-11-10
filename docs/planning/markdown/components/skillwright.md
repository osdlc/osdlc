---
name: skillwright
kind: app
language: rust
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: published
version: "0.9.0"
registry: "https://crates.io/crates/skillwright"
repo_present: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_present: packages/rust/skillwright
repo_target: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_target: packages/rust/skillwright
depends:
  - "[markdown-relink](markdown-relink.md)"
  - "[markdown-corpus-rs](markdown-corpus-rs.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
  - "[path-guard-rs](path-guard-rs.md)"
  - "[etag-write-rs](etag-write-rs.md)"
  - "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[vfs-walk](vfs-walk.md)"
  - "[markdown-vault-fs](markdown-vault-fs.md)"
  - "[markdown-contract-rs](markdown-contract-rs.md)"
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
  - edge: depends
    to: "[vfs-walk](vfs-walk.md)"
    note: Through its tradecraft-core crate.
  - edge: depends
    to: "[markdown-vault-fs](markdown-vault-fs.md)"
    note: Through its tradecraft-core crate.
  - edge: depends
    to: "[markdown-contract-rs](markdown-contract-rs.md)"
    note: Through its tradecraft-core crate.
---

A CLI that publishes a vault of skill notes into the formats of coding-agent tools, checks them for
drift, and edits and reorganizes the vault.

## Notes

- Uses the osdlc Rust crates from crates.io, partly through its tradecraft-core crate.
- Its workspace pins some older versions than the latest: markdown-corpus 0.2.0, markdown-relink
  0.3.0, markdown-vault-fs 0.5.0, markdown-link 0.8.0.
- It moved out of osdlc/osdlc into osdlc/skillwright.
