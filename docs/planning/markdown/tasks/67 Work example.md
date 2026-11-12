---
number: 67
title: Work example
detail: "end state, in CI"
status: todo
type: functional
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[35 Example pair](35%20Example%20pair.md)"
  - "[63 Starter corpus](63%20Starter%20corpus.md)"
  - "[70 References](70%20References.md)"
  - "[71 Uses](71%20Uses.md)"
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
  - "[66 Publish starter](66%20Publish%20starter.md)"
  - "[79 Markdown after the move](79%20Markdown%20after%20the%20move.md)"
---

An example of the beeline's end state, checked in CI: `examples/work/`, a project corpus shaped like
a work repo's `docs/planning/`. Its root file has `extends: { sdlc: "@osdlc/corpus-profile-sdlc" }`,
`uses: [sdlc/*]` and `references: { osdlc: "@osdlc/corpus-sdlc-starter" }`, each package installed
from npm. It holds `_references/osdlc/` from `corpus-schema sync`, and a task that cites `P-0002`
by id. A second, plain vault with no types references the starter too. It reuses the example pair's
harness from task 35: CI installs the parents, runs sync and validates with `--strict`, and
`examples/test.sh` adds a case where the copy is stale and the run must fail.

Task 79 switches the fernlog example to install the claims profile from npm. That covers most of the
harness change, since fernlog then consumes a profile from npm like this example does. What is left
here is the sdlc and starter case. After 35, 63, 70, 71, 61, 66 and 79.
