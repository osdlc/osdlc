---
number: 59
title: Trusted publishing
detail: npm names, owner
status: owner
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
---

Set up npm trusted publishing for each package this repo publishes. Owner work: it needs the npm
account. Point `@osdlc/corpus-schema` at this repo's publish workflow, since it now releases from
here (task 21). Stage each new name once and add its trusted publisher: `@osdlc/corpus-profile-claims`
(task 23), `@osdlc/corpus-profile-sdlc` (task 49) and `@osdlc/corpus-sdlc-starter` (task 63). A name
can be staged once its package is built. Waits on nothing, so the owner can start with
corpus-schema now.
