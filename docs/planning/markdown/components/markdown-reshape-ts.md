---
name: "@osdlc/markdown-reshape"
kind: package
language: ts
layer: "[corpus-model](../layers/corpus-model.md)"
states: [target]
status: planned
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-reshape
twin: "[markdown-reshape-rs](markdown-reshape-rs.md)"
tasks:
  - "[40 Reshape in TS](../tasks/40%20Reshape%20in%20TS.md)"
depends_new:
  - "[markdown-link](markdown-link.md)"
  - "[markdown-corpus](markdown-corpus.md)"
  - "[etag-write](etag-write.md)"
  - "[yaml-splice](yaml-splice.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: In place of the Rust corpus crate.
---

The planned TypeScript twin of markdown-reshape-rs: move, rename, split, merge and extract over a
corpus of notes.

## Notes

- The Rust crate depends on markdown-vault-fs and vfs-seam. There is no TypeScript port of either
  yet, so this package has no edge for them.
- Two ways to provide TypeScript: port the crate, or build it to WebAssembly, as yaml-splice-wasm
  does for yaml-splice. Task 40 holds the open question.
- The path follows osdlc/osdlc's `packages/ts/<name>` layout. The plan does not give one.
