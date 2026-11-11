---
name: "@osdlc/pack-intent"
kind: profile
language: yaml
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/pack-intent
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: packages/ts/pack-intent
tasks:
  - "[47 Merge packs](../tasks/47%20Merge%20packs.md)"
  - "[49 SDLC profiles](../tasks/49%20SDLC%20profiles.md)"
links:
  - "[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070)"
depends:
  - "[model-schema](model-schema.md)"
---

The intent pack. It declares why a project exists and what it holds to: principles, standards,
decisions, drivers, products, capabilities, terms and references.

## Notes

- Only in open PR sksizer/dev#4070, stacked on #4069. Private, not on npm.
- Task 49 generates @osdlc/corpus-profile-intent from it.
