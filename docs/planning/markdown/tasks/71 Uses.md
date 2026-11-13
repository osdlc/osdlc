---
number: 71
title: Uses
detail: "uses: [sdlc/*]"
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

`uses` in the root file, as decision D15 says. `uses: [sdlc/*]` takes a parent's types as they are,
so a corpus no longer needs a one-line schema file that holds only `x-extends` for each type. After
9. In progress in [#12](https://github.com/osdlc/markdown/pull/12).
