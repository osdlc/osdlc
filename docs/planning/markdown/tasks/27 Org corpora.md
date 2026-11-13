---
number: 27
title: Org corpora
detail: "a parent: types only"
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

Org corpora as packages. A corpus names other corpora in its root file: parents under `extends`,
whose types it builds on, and corpora under `references`, whose records it cites (decision D15,
task 70). A parent gives types only. A named corpus is an npm package (a version range plus the
lockfile pin), a git dependency for a private org corpus, or a local folder. Loading is transitive,
and a cycle is an error. An update arrives when the lockfile changes. After 9. See [Sharing across
corpora](https://github.com/osdlc/markdown/blob/main/docs/ecosystem-plan.md#sharing-across-corpora).
In progress in [#12](https://github.com/osdlc/markdown/pull/12).
