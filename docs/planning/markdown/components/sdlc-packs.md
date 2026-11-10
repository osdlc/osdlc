---
name: "@osdlc/pack-intent and @osdlc/pack-sdlc"
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
  - "[9 Extends](../tasks/9%20Extends.md)"
links:
  - "[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070)"
depends:
  - "[model-schema](model-schema.md)"
---

Two packs that port sdlc's 14 entity kinds (task, decision, principle and the rest) into the pack
format.

## Notes

- Only in open PR sksizer/dev#4070, stacked on #4069. The other package is at
  packages/ts/pack-intent.
- The plan's levels-and-profiles diagram shows an sdlc profile with today's sdlc kinds. It does not
  say whether these packs become it, or where they live, so the target is unchanged here.
