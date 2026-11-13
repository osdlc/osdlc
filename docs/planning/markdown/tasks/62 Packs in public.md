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
  - "[78 Models repo setup](78%20Models%20repo%20setup.md)"
---

Move `@osdlc/model-schema` and the intent and sdlc packs to osdlc/models, as decided in
[D17](../decisions/D17%20Profiles%20and%20corpora%20live%20in%20osdlc%20models.md). The profiles and
the starter corpus are already there (task 78). Today the generator and the packs are in
sksizer/dev, which is private. Until this task is done, regenerating the sdlc profile is manual: run
the generator in dev and copy its output into osdlc/models.

In osdlc/models, CI then regenerates the sdlc profile from the packs and checks that the committed
copy matches. Not on the beeline's critical path. After 47, 49, 75 and 78.
