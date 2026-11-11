---
number: 44
title: Flatten extends
detail: closed child types
status: todo
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
---

Flatten `x-extends`. A closed child type, one with `additionalProperties: false`, sees the fields of
every type above it. So it no longer has to list them as `true`. The child can still tighten a
parent's rule, and never loosen it. When this lands, remove the workaround from
[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14): the plan's tasks and milestones
types stop listing the profile's fields. After 9.
