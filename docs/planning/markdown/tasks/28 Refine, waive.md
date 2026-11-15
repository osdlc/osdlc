---
number: 28
title: "Refine, waive"
detail: local vs referenced
status: todo
type: functional
milestone: "[m-sharing](../milestones/m-sharing.md)"
after:
  - "[27 Org corpora](27%20Org%20corpora.md)"
---

Refine and waive. A local record can say `refines` (a local version that narrows a referenced
record) or `waives` (it doesn't apply here, with a reason). Today a local record may share an id
with a referenced one, and a reference by id that matches both is an error. After 27. Still a
proposal.
