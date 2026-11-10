---
number: 28
title: "Refine, waive"
detail: local vs inherited
status: todo
type: functional
milestone: "[m-sharing](../milestones/m-sharing.md)"
after:
  - "[27 Org corpora](27%20Org%20corpora.md)"
---

Refine and waive. A local record can say `refines` (a local version that narrows an inherited
record) or `waives` (it doesn't apply here, with a reason). A local record with the same type and id
as an inherited one is an error unless it says `refines`. After 27. Still a proposal.
