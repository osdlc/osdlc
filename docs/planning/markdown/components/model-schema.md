---
name: "@osdlc/model-schema"
kind: package
language: ts
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/model-schema
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/model-schema
tasks:
  - "[9 Extends](../tasks/9%20Extends.md)"
links:
  - "[sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069)"
---

The pack harness: loads packs (folders of YAML that declare kinds), compiles them, validates values
and emits TypeScript types and JSON Schema.

## Notes

- Only in open PR sksizer/dev#4069. It is not on dev main or npm.
- Task 9 says model-schema moves to osdlc but does not name the repo. osdlc/osdlc is shown because
  the plan says packages stay there until they move to osdlc/markdown.
- Decision D4 is open: profiles written as packs, or plain JSON Schema files that packs compile to.
  Problem F5: two ways to define types.
- Packs differ from the proposed profiles: a record's own property replaces an inherited one, and
  strict can be overridden.
