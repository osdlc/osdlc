---
number: 49
title: SDLC profiles
detail: intent and sdlc
status: todo
type: functional
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[48 Profile generator](48%20Profile%20generator.md)"
  - "[44 Flatten extends](44%20Flatten%20extends.md)"
  - "[45 Refs by id](45%20Refs%20by%20id.md)"
  - "[46 Multi-type x-ref](46%20Multi-type%20x-ref.md)"
---

Generate `@osdlc/corpus-profile-intent` and `@osdlc/corpus-profile-sdlc` from the packs. The sdlc
profile extends the intent profile. A closed type needs flattened `x-extends` to see its parent's
fields. Their refs are ids and wikilinks, some to several types. After 48, 44, 45 and 46.
