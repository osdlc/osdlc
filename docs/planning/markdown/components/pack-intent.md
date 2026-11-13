---
name: "@osdlc/pack-intent"
kind: profile
language: yaml
layer: "[model](../layers/model.md)"
states: [present, target]
status: in-progress
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: packages/ts/pack-intent
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: packages/ts/pack-intent
tasks:
  - "[47 Merge packs](../tasks/47%20Merge%20packs.md)"
  - "[49 SDLC profiles](../tasks/49%20SDLC%20profiles.md)"
  - "[62 Packs in public](../tasks/62%20Packs%20in%20public.md)"
links:
  - "[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070)"
depends:
  - "[model-schema](model-schema.md)"
---

The intent pack. It declares why a project exists and what it holds to: principles, standards,
decisions, drivers, products, capabilities, terms and references.

## Notes

- sksizer/dev#4070 merged it into dev's code-intelligence-planning branch, which reaches main with
  sksizer/dev#4068. Private, not on npm.
- It stays in sksizer/dev for now (decision D19). Task 62 planned to move it to
  osdlc/models (decision D17).
- Task 49 generates @osdlc/corpus-profile-sdlc from it and the sdlc pack.
