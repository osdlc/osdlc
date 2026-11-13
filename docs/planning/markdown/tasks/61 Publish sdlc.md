---
number: 61
title: Publish sdlc
detail: "sdlc profile, owner"
status: owner
type: supporting
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[49 SDLC profiles](49%20SDLC%20profiles.md)"
  - "[80 Profile publishers](80%20Models%20publishers.md)"
  - "[78 Bring in profiles](78%20Models%20repo%20setup.md)"
---

Publish `@osdlc/corpus-profile-sdlc` to npm from its folder in osdlc/osdlc (task 78). Owner work:
merging the Version Packages pull request there publishes it. dev (task 50), the starter corpus
(task 66), this plan (task 53) and the work repo (task 52) install it from npm. After 49, 78 and
80, which sets up its trusted publisher.
