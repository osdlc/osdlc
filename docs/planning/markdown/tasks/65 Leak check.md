---
number: 65
title: Leak check
detail: no private data
status: todo
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[63 Starter corpus](63%20Starter%20corpus.md)"
---

A CI check that the starter corpus holds no private data, since its records ship to a public
registry. It fails on a link or path into a private repo such as sksizer/dev, an absolute home
path, an email address, and a wikilink or id that names a record the corpus does not hold. The
check runs on every pull request that touches `corpora/sdlc-starter/`, and before each publish. Records
carried over from dev (task 64) go through it too. After 63.
