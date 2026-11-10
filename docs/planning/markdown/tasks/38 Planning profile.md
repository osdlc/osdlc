---
number: 38
title: Planning profile
detail: plan types as a profile
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
---

The planning profile. Tasks, milestones and decisions become a profile, `@osdlc/corpus-profile-planning`
in `profiles/planning/`, a corpus with only types. This plan's corpus names it under `extends` and
builds its own types on the profile's with `x-extends`. Tasks and milestones add fields, and
decisions use the profile's type as it is. The components, layers, repos, overlaps and datasets
stay local: they describe this ecosystem. CI checks the plan with this repo's corpus-schema, which
knows `extends`. The profile is private and not on npm. After 9.
