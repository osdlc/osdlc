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
  - "[75 Create models repo](75%20Create%20models%20repo.md)"
---

Move `@osdlc/model-schema`, the intent and sdlc packs, `profiles/sdlc/` and `corpora/sdlc-starter/`
to osdlc/models, as decided in
[D17](../decisions/D17%20Profiles%20and%20corpora%20live%20in%20osdlc%20models.md). Today the
generator and the packs are in sksizer/dev, which is private, and the profile and the starter are
here. Until this task is done, regenerating the profile is manual: run the generator in dev and copy
its output here.

In osdlc/models, CI regenerates the sdlc profile from the packs and checks that the committed copy
matches. The profile and the starter publish from there, under the same npm names. Not on the
beeline's critical path. After 47, 49 and 75.
