---
number: 9
title: Extends
detail: package or path
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
  - "[21 Release here](21%20Release%20here.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

Parents: `extends` and `x-extends`. D4 is decided, so the work is to build it in the validator. A
corpus names its parents in the root file. `extends` maps a prefix to a source. The source is a
package name, found the way Node finds packages from the corpus folder, or a relative path that
starts with `./` or `../`. Parents load transitively, a cycle is an error, and the prefix is always
required. A type says which type it builds on with `x-extends: claims/statements`, or `x-extends:
<local type>` for a type in the same corpus. A record must pass its own schema and the schema of
every type above it. A child may add rules and tighten them, never loosen them. A type has one
parent at first. This task also covers cross-corpus `x-ref`. A parent gives types only, so a local record
may share an id with a parent's record (see [Sharing across
corpora](../ecosystem-plan.md#sharing-across-corpora)).
It no longer waits on [sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069): types are plain
JSON Schema, so moving model-schema to osdlc is separate work. After 3 and 21. In progress in
[#12](https://github.com/osdlc/markdown/pull/12).

Done: `extends`, `x-extends` and cross-corpus `x-ref` is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
