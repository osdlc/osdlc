---
number: 53
title: Plan on sdlc
detail: first remote consumer
status: todo
type: functional
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
  - "[66 Publish starter](66%20Publish%20starter.md)"
  - "[79 Markdown after the move](79%20Markdown%20after%20the%20move.md)"
---

This plan, `docs/planning/markdown/`, is the first remote consumer of the sdlc profile and the starter
corpus. It installs `@osdlc/corpus-profile-sdlc` and `@osdlc/corpus-sdlc-starter` from npm. Its
root file names the profile under `extends` with the prefix `sdlc` and takes the sdlc types. The
explorer's own fields, such as `phase`, `beeline`, `prs`, `detail` and `order`, go in local
schemas that build on the profile's types with `x-extends: sdlc/tasks`, `x-extends:
sdlc/milestones` and so on. The root file names the starter under `references` with the prefix
`osdlc`. `corpus-schema sync` writes `_references/osdlc/`, and a record cites `P-0002`.

The records move to sdlc ids, such as `T-0001`, `M-0001` and `D-0001`, and to the sdlc fields.
The explorer's `build-data` and the BEELINE checklist generator read the new ids and fields, and
resolve parents by package name. Its `profile/` folder is deleted: before 1.0 no second form is
kept. The components, layers, repos, overlaps and datasets stay local types.

It replaces the work example (task 67): this plan shows the end state in this repo's CI, from npm,
before the work repo copies it. After 61 and 66, which publish the two packages, and 79, which
cleans up osdlc/markdown after the move.
