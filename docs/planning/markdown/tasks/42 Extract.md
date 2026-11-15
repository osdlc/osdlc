---
number: 42
title: Extract
detail: markdown-reshape
status: todo
type: functional
milestone: "[m-model](../milestones/m-model.md)"
after:
  - "[41 Split and merge](41%20Split%20and%20merge.md)"
---

Add extract to markdown-reshape. It pulls one thread out of the graph: a note and what it links to,
followed to some depth or by type. The thread is copied or moved into its own folder or corpus.
Links inside it are kept. Links leaving it are rewritten or flagged. After 41.

Open questions:

- What is the stopping rule: depth, link type or the corpus boundary?
- Can the result be a new corpus that `extends` the source?
