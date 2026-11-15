---
number: 44
title: Flatten extends
detail: closed child types
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

Flatten `x-extends`. A closed child type, one with `additionalProperties: false`, sees the fields of
every type above it. So it no longer has to list them as `true`. The child can still tighten a
parent's rule, and never loosen it. After 9. Built in
[#12](https://github.com/osdlc/markdown/pull/12). The plan's tasks and milestones
types no longer list the profile's fields ([#14](https://github.com/osdlc/markdown/pull/14)).

Done: flattened `x-extends` is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
