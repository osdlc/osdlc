---
number: 59
title: Trusted publishing
detail: npm names, owner
status: owner
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
---

Set up npm trusted publishing for each package this repo publishes. Owner work: it needs the npm
account. Point `@osdlc/corpus-schema` at this repo's publish workflow, since it releases from
here (task 21). Do this first: release 0.3.0 (task 36) needs it, and it waits on nothing.

The other names publish from [osdlc/models](https://github.com/osdlc/models) (decision D17). Stage
each once and point its trusted publisher at that repo's publish workflow: `@osdlc/corpus-profile-claims`
(task 23), `@osdlc/corpus-profile-sdlc` (task 49) and `@osdlc/corpus-sdlc-starter` (task 63). Do
this once task 78 has put the workflow there. Tasks 60, 61 and 66 publish after that.
