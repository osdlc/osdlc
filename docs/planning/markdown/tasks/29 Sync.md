---
number: 29
title: Sync
detail: "_inherited copy"
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[27 Org corpora](27%20Org%20corpora.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

`corpus-schema sync`. It writes a read-only, committed copy of each parent corpus into
`_inherited/<prefix>/`, including the parent's own `_inherited/`, so Obsidian and GitHub links
resolve. The validator skips that folder when it looks for local records, treats a link into it as a
link to the parent's record, and says "run corpus-schema sync" when the copy differs from the
installed parent. After 27. In progress in [#12](https://github.com/osdlc/markdown/pull/12).
Decision D15 moves the copy to `_references/<prefix>/`, for referenced corpora (task 70).
