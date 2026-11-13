---
name: markdown-corpus
kind: crate
language: rust
layer: "[corpus-model](../layers/corpus-model.md)"
states: [present, target]
status: published
version: "0.3.1"
registry: "https://crates.io/crates/markdown-corpus"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/rust/markdown-corpus
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-corpus
twin: "[markdown-corpus](markdown-corpus.md)"
links:
  - "[osdlc/osdlc#650](https://github.com/osdlc/osdlc/pull/650)"
depends:
  - "[frontmatter-lossless-rs](frontmatter-lossless-rs.md)"
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[markdown-vault-fs](markdown-vault-fs.md)"
  - "[slug-collate](slug-collate.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
edge_notes:
  - edge: twin
    to: "[markdown-corpus](markdown-corpus.md)"
    note: "Planned: the TypeScript model is the crate's twin (task 12)."
---

The corpus model in Rust: every note and file in a folder, their links in both directions, tags and
frontmatter, kept up to date as files change.

## Notes

- It never rejects a note: a note with broken frontmatter is read as body only.
- Decision D3: the crate keeps its name, and the TypeScript model takes the same name.
- Release PR osdlc/osdlc#730 took it to 0.3.1.
- Open osdlc/osdlc#650 changes it (see markdown-vault-fs).
