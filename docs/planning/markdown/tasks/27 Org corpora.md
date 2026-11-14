---
number: 27
title: Org corpora
detail: "a parent: types only"
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

Org corpora as packages. A corpus names other corpora in its root file: parents under `extends`,
whose types it builds on, and corpora under `references`, whose records it cites (decision D15,
task 70). A parent gives types only. A named corpus is an npm package (a version range plus the
lockfile pin), a git dependency for a private org corpus, or a local folder. Loading is transitive,
and a cycle is an error. An update arrives when the lockfile changes. After 9. See [Sharing across
corpora](../ecosystem-plan.md#sharing-across-corpora).
Built in [#12](https://github.com/osdlc/markdown/pull/12).

Done: `extends` and `references`, with transitive loading and cycle errors is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
