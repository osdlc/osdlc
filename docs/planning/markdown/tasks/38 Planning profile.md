---
number: 38
title: Planning profile
detail: markdown PR 14
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14)"
---

The planning profile. Tasks, milestones and decisions become a profile, `@osdlc/corpus-profile-planning`
in `profiles/planning/`, a corpus with only types. This plan's corpus names it under `extends` and
builds its own types on the profile's with `x-extends`. Tasks and milestones add fields, and
decisions use the profile's type as it is. The components, layers, repos, overlaps and datasets
stay local: they describe this ecosystem. CI checks the plan with this repo's corpus-schema, which
knows `extends`. The profile is private and not on npm. After 9. In progress in
[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14).

Task 53 removes the profile: the plan moves to the sdlc profile and `profiles/planning/` is
deleted.
