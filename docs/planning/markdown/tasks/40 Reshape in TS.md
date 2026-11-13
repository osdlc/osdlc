---
number: 40
title: Reshape in TS
detail: "@osdlc/markdown-reshape"
status: todo
type: functional
milestone: "[m-model](../milestones/m-model.md)"
after:
  - "[39 Rename relink](39%20Rename%20relink.md)"
  - "[12 One TS model](12%20One%20TS%20model.md)"
---

The TypeScript twin, `@osdlc/markdown-reshape`, built on markdown-corpus. After 39 and 12.

Open question: a TypeScript port, or a WebAssembly build of the crate, as yaml-splice-wasm does for
yaml-splice? A port needs TypeScript versions of markdown-vault-fs and vfs-seam, which do not exist
yet. A WebAssembly build avoids that.
