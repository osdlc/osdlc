---
number: 48
title: Profile generator
detail: packs to profiles
status: doing
type: functional
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[47 Merge packs](47%20Merge%20packs.md)"
prs:
  - "[sksizer/dev#4163](https://github.com/sksizer/dev/pull/4163)"
---

A generator in model-schema, in sksizer/dev, that turns a pack into a corpus profile. Each kind
becomes a type folder. Refs become `x-ref` with `x-ref-form`. A kind's id pattern becomes
`x-id-pattern` as it is, so corpus-schema 0.3 cuts the id out of a `<id>-<slug>` file name. A
binding's `recordFile` becomes `x-record-file`. A pack's `requires` becomes `extends`, or with
`--inline` one profile holds the required packs' types. `--target 0.2` writes a form that
corpus-schema 0.2.0 can check, with refs checked only by their patterns. After 47. In progress in
[sksizer/dev#4163](https://github.com/sksizer/dev/pull/4163).
