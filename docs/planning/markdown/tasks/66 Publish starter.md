---
number: 66
title: Publish starter
detail: "starter corpus, owner"
status: owner
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[63 Starter corpus](63%20Starter%20corpus.md)"
  - "[65 Leak check](65%20Leak%20check.md)"
  - "[80 Models publishers](80%20Models%20publishers.md)"
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
  - "[78 Models repo setup](78%20Models%20repo%20setup.md)"
---

Publish `@osdlc/corpus-sdlc-starter` to npm from `corpora/sdlc-starter/` in osdlc/models. Owner
work: merging the Version Packages pull request there publishes it. Its `package.json` depends on `@osdlc/corpus-profile-sdlc`, so that is published
first. After 63, 65, 61, 78 and 80.
