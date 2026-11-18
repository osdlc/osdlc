---
number: 35
title: Example pair
detail: "org + project, CI"
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[23 Claims profile](23%20Claims%20profile.md)"
  - "[29 Sync](29%20Sync.md)"
  - "[36 Release 0.4.0](36%20Release%200.3.0.md)"
prs:
  - "[osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16)"
  - "[osdlc/osdlc#794](https://github.com/osdlc/osdlc/pull/794)"
---

The example pair. Check in an org corpus with records (a few principles) and a project corpus that
extends the claims profile by package name and references the org corpus by path. The project's
local records cite the org's principles. CI installs the claims profile, runs `corpus-schema sync`
and validates both corpora. This is the start of task 30. After 23, 29 and 36. Built in
[#16](https://github.com/osdlc/markdown/pull/16) and brought to osdlc/osdlc by task 78:
`packages/corpora/examples/org-principles/` and `packages/corpora/examples/fernlog/`, with the
claims profile coming in by package name through a `file:` dependency on
`packages/profiles/claims/`. `.github/workflows/profiles.yml` checks the pair. Task 79 switches
fernlog to the claims profile from npm.

Done: the pair is in `packages/corpora/examples/` and `.github/workflows/profiles.yml` checks it. Switching fernlog to the claims profile from npm is task 79.
