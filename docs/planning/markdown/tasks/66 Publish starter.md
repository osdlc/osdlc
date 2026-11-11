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
  - "[59 Trusted publishing](59%20Trusted%20publishing.md)"
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
---

Publish `@osdlc/corpus-sdlc-starter` to npm. Owner work: merging the Version Packages pull request
publishes it. Its `package.json` depends on `@osdlc/corpus-profile-sdlc`, so that is published
first. After 63, 65, 59 and 61.
