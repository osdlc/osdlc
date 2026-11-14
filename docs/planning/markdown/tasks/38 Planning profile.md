---
number: 38
title: Planning profile
detail: markdown PR 14
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14)"
  - "[osdlc/osdlc#791](https://github.com/osdlc/osdlc/pull/791)"
---

The planning profile. Tasks, milestones and decisions become a profile, `@osdlc/corpus-profile-planning`
in `docs/planning/markdown/profile/`, a corpus with only types. This plan's corpus names it under `extends` and
builds its own types on the profile's with `x-extends`. Tasks and milestones add fields, and
decisions use the profile's type as it is. The components, layers, repos, overlaps and datasets
stay local: they describe this ecosystem. CI in osdlc/osdlc checks the plan with its corpus-schema, which
knows `extends`. The profile is private and not on npm. After 9. Built in
[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14).

Task 53 removes the profile: the plan moves to the sdlc profile and `profile/` is
deleted.

Done: the profile is in `docs/planning/markdown/profile/` and this plan extends it, checked in CI. Task 53 removes it.
