---
number: 27
title: Org corpora
detail: inherit records
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

Corpus inheritance. A parent named under `extends` can bring its records, not just its types. A
corpus sees the parent's types and records read-only, next to its own records. A parent is an npm
package (a version range plus the lockfile pin), a git dependency for a private org corpus, or a
local folder. Loading is transitive. A parent update arrives when the lockfile changes. After 9. See
[Sharing across
corpora](https://github.com/osdlc/markdown/blob/main/docs/ecosystem-plan.md#sharing-across-corpora).
In progress in [#12](https://github.com/osdlc/markdown/pull/12).
Decision D15 changes this: `extends` brings types only, and records come in through `references`
(task 70).
