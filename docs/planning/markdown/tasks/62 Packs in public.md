---
number: 62
title: Packs in public
detail: regenerate in public
status: todo
type: functional
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[47 Merge packs](47%20Merge%20packs.md)"
  - "[49 SDLC profiles](49%20SDLC%20profiles.md)"
---

Move `@osdlc/model-schema` and the intent and sdlc packs to a public osdlc repo, so the sdlc
profile is regenerated and drift-checked in public. Today the generator and the packs are in
sksizer/dev, which is private, and the profile is in `profiles/sdlc/` here. Until this task is
done, regenerating the profile is manual: run the generator in dev and copy its output here. CI
then checks that the committed profile matches what the packs generate. Not on the beeline's
critical path. After 47 and 49.
