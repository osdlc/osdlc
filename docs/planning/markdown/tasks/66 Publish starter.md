---
number: 66
title: Publish starter
detail: "starter corpus, owner"
status: done
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[63 Starter corpus](63%20Starter%20corpus.md)"
  - "[65 Leak check](65%20Leak%20check.md)"
  - "[80 Profile publishers](80%20Models%20publishers.md)"
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
  - "[78 Bring in profiles](78%20Models%20repo%20setup.md)"
prs:
  - "[osdlc/osdlc#794](https://github.com/osdlc/osdlc/pull/794)"
  - "[osdlc/osdlc#804](https://github.com/osdlc/osdlc/pull/804)"
---

Publish `@osdlc/corpus-sdlc-starter` to npm from its folder in osdlc/osdlc (task 78). Owner
work: merging the Version Packages pull request there publishes it. Its `package.json` depends on `@osdlc/corpus-profile-sdlc`, so that is published
first. After 63, 65, 61, 78 and 80.

Done: `@osdlc/corpus-sdlc-starter` 0.1.0 is on npm, published 2026-11-13.
