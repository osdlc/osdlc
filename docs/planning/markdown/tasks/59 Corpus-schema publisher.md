---
number: 59
title: Corpus-schema publisher
detail: dropped
status: done
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
---

Move the npm trusted publisher of `@osdlc/corpus-schema` to osdlc/markdown's publish workflow. No
longer needed: [D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md) keeps corpus-schema releasing from osdlc/osdlc, so its publisher stays as it
is. The record stays so that links to it still resolve.

The profile and starter packages get their trusted publishers in task 80.
