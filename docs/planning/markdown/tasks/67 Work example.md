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
---

An example of the beeline's end state, checked in CI: `examples/work/`, a project corpus shaped like
a work repo's `docs/planning/`. Its root file has `extends: { sdlc: "@osdlc/corpus-profile-sdlc" }`,
`uses: [sdlc/*]` and `references: { osdlc: "@osdlc/corpus-sdlc-starter" }`, each package through a
`file:` dependency on its folder in this repo. It holds `_references/osdlc/` from `corpus-schema
sync`, and a task that cites `P-0002` by id. A second, plain vault with no types references the
starter too. It reuses the example pair's harness from task 35: CI installs the parents, runs sync and
validates with `--strict`, and `examples/test.sh` adds a case where the copy is stale and the run
must fail. After 35, 63, 70 and 71.
