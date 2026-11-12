---
number: 80
title: Models publishers
detail: npm, owner
status: owner
type: supporting
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[78 Models repo setup](78%20Models%20repo%20setup.md)"
---

Set up npm trusted publishing for the packages that publish from
[osdlc/models](https://github.com/osdlc/models) (decision D17): `@osdlc/corpus-profile-sdlc` (task
49), `@osdlc/corpus-profile-claims` (task 23) and `@osdlc/corpus-sdlc-starter` (task 63). Stage
each name once and point its trusted publisher at osdlc/models' release workflow. Owner work: it
needs the npm account. After 78, which adds that workflow. Tasks 60, 61 and 66 publish after it.
