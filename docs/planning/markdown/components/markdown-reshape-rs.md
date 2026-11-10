---
name: markdown-reshape
kind: crate
language: rust
layer: "[corpus-model](../layers/corpus-model.md)"
states: [target]
status: planned
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/rust/markdown-reshape
twin: "[markdown-reshape-ts](markdown-reshape-ts.md)"
tasks:
  - "[39 Rename relink](../tasks/39%20Rename%20relink.md)"
  - "[41 Split and merge](../tasks/41%20Split%20and%20merge.md)"
  - "[42 Extract](../tasks/42%20Extract.md)"
depends_new:
  - "[markdown-link-rs](markdown-link-rs.md)"
  - "[markdown-corpus-rs](markdown-corpus-rs.md)"
  - "[markdown-vault-fs](markdown-vault-fs.md)"
  - "[vfs-seam](vfs-seam.md)"
  - "[etag-write-rs](etag-write-rs.md)"
  - "[yaml-splice-rs](yaml-splice-rs.md)"
---

Changes how notes are arranged without changing what they say, as a plan you can review before it
is applied. Its operations are move, rename, split, merge and extract.

## Notes

- It is markdown-relink under a new name: the same library, renamed (task 39). The old record,
  markdown-relink, is present only and retiring.
- The path is the old folder renamed. osdlc/osdlc's `packages/rust/<name>` layout gives it.
- Reshape means a change to how notes are arranged, not to what they say. It is the plain word for
  refactor.
- Move relocates a note and the links follow. This is what relink does today. Rename is a move
  within a folder.
- Split turns one note into several and redirects each link to the right piece (task 41). Merge
  makes links to any merged note point to the result (task 41).
- Extract pulls one thread out of the graph into its own folder or corpus (task 42). The thread is
  a note and what it links to, followed to some depth or by type. Links inside it are kept. Links
  leaving it are rewritten or flagged. The result could be a new corpus that `extends` the
  original.
- Its code still says vault (VaultFacts). Task 39 renames those terms.
- Consumers to switch: skillwright and the determined notes app, which uses it through its Rust
  backend.
