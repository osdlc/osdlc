---
name: "@osdlc/pack-sdlc"
kind: profile
language: yaml
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/pack-sdlc
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: packages/ts/pack-sdlc
tasks:
  - "[47 Merge packs](../tasks/47%20Merge%20packs.md)"
  - "[49 SDLC profiles](../tasks/49%20SDLC%20profiles.md)"
links:
  - "[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070)"
depends:
  - "[model-schema](model-schema.md)"
extends:
  - "[pack-intent](pack-intent.md)"
edge_notes:
  - edge: extends
    to: "[pack-intent](pack-intent.md)"
    note: "Its pack.yaml requires intent ^0.1.0."
---

The sdlc pack. It declares the work a project plans and tracks: work items, milestones, backlog,
roadmaps, friction and notes. It builds on the intent pack.

## Notes

- Only in open PR sksizer/dev#4070, stacked on #4069. Private, not on npm.
- Together with the intent pack it ports sdlc's 14 entity kinds from hand-written zod.
- Task 49 generates @osdlc/corpus-profile-sdlc from it.
