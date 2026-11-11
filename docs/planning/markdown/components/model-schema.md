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
  - "[47 Merge packs](../tasks/47%20Merge%20packs.md)"
  - "[48 Profile generator](../tasks/48%20Profile%20generator.md)"
  - "[54 Named relations](../tasks/54%20Named%20relations.md)"
  - "[55 Augment](../tasks/55%20Augment.md)"
  - "[58 Second store](../tasks/58%20Second%20store.md)"
  - "[62 Packs in public](../tasks/62%20Packs%20in%20public.md)"
links:
  - "[sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069)"
---

The pack harness: loads packs (folders of YAML that declare kinds), compiles them, validates values
and emits TypeScript types and JSON Schema.

## Notes

- sksizer/dev#4069 merged it into dev's code-intelligence-planning branch, which reaches main with
  sksizer/dev#4068. It is not on npm.
- Task 62 moves it and the packs to a public osdlc repo. osdlc/osdlc is shown because the plan says
  packages stay there until they move to osdlc/markdown.
- Decision D4 makes types plain JSON Schema. Decision D13 puts packs above that as the model, and
  corpus-schema below as the store spec for Markdown. That answers problem F5: two ways to define
  types.
- Task 48 adds a generator that turns a pack into a corpus profile.
- Packs differ from the proposed profiles: a record's own property replaces an inherited one, and
  strict can be overridden.
