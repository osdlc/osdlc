---
number: 48
title: Profile generator
detail: packs to profiles
status: todo
type: functional
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[47 Merge packs](47%20Merge%20packs.md)"
---

A generator in model-schema that turns a pack into a corpus profile. Each kind becomes a type
folder. Refs become `x-ref`. Id patterns become `x-id-pattern`. A pack's `requires` becomes
`extends`. It can also write a flattened copy: one corpus with no `extends`, which corpus-schema
0.2.0 can check. In 0.2.0, refs by id are checked only as strings. After 47.
