---
number: 68
title: Work cites starter
detail: the end state
status: todo
type: functional
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[52 Work extends](52%20Work%20extends.md)"
  - "[66 Publish starter](66%20Publish%20starter.md)"
  - "[67 Work example](67%20Work%20example.md)"
---

The work repo reaches the beeline's end state. It installs `@osdlc/corpus-profile-sdlc` and
`@osdlc/corpus-sdlc-starter` from npm, extends `sdlc`, uses `sdlc/*` and references `osdlc`. It runs
`corpus-schema sync` and commits `_references/osdlc/`. Its tasks cite the starter's principles and standards
by id, such as `P-0002`. CI runs `corpus-schema validate --strict`, which also fails on a stale copy.
Updating the starter is then a version bump, a sync and a commit. After 52, 66 and 67, whose example
it copies.
