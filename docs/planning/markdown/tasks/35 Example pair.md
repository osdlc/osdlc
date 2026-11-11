---
number: 35
title: Example pair
detail: "org + project, CI"
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[23 Claims profile](23%20Claims%20profile.md)"
  - "[29 Sync](29%20Sync.md)"
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
prs:
  - "[osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16)"
---

The example pair. Check in an org corpus with records (a few principles) and a project corpus that
extends both the claims profile and the org corpus, by package name and by path. The project's local
records cite inherited ones. CI installs the parents, runs `corpus-schema sync` and validates both
corpora. This is the start of task 30. After 23, 29 and 36. In progress in
[#16](https://github.com/osdlc/markdown/pull/16): `examples/org-principles/` and `examples/fernlog/`,
with the claims profile coming in by package name through a `file:` dependency.
