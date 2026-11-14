---
number: 29
title: Sync
detail: "_references copy"
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[27 Org corpora](27%20Org%20corpora.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

`corpus-schema sync`. It writes a read-only, committed copy of each referenced corpus into
`_references/<prefix>/`, including that corpus's own `_references/`, so Obsidian and GitHub links
resolve. A parent under `extends` gets no copy (decision D15). The validator skips that folder when
it looks for local records, treats a link into it as a link to the referenced corpus's record, and
says "run corpus-schema sync" when the copy differs from the installed corpus. After 27. In
progress in [#12](https://github.com/osdlc/markdown/pull/12).

Done: `corpus-schema sync` is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
