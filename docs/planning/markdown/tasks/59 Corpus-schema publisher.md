---
number: 59
title: Corpus-schema publisher
detail: npm, owner
status: owner
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
---

Move the npm trusted publisher of `@osdlc/corpus-schema` to this repo's publish workflow, since it
releases from here (task 21). npm lists osdlc/osdlc as its repository today. Owner work: it needs
the npm account. It waits on nothing. Release 0.3.0 (task 36) comes after it.

The packages that publish from osdlc/models get their trusted publishers in task 80.
