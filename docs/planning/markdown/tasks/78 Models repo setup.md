---
number: 78
title: Models repo setup
detail: profiles and starter in osdlc/osdlc
status: todo
type: supporting
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
  - "[75 Create models repo](75%20Create%20models%20repo.md)"
---

Bring the profiles and the starter corpus into osdlc/osdlc, so they publish from it ([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)). They do
not go to osdlc/models, as D17 planned. Their place in osdlc/osdlc is not decided: the proposal is
`packages/profiles/*` and `packages/corpora/*`, as members of the pnpm workspace. Owner work
decides it.

Bring in `profiles/sdlc/`, `profiles/claims/` and `corpora/sdlc-starter/` from
[#19](https://github.com/osdlc/markdown/pull/19) and
[#15](https://github.com/osdlc/markdown/pull/15).
[osdlc/models#1](https://github.com/osdlc/models/pull/1) holds the same three packages moved; use
whichever is newer. Add them to the package checks and the changeset config, and check them in CI
with corpus-schema 0.3.0. The trusted publishers (task 80) point at osdlc/osdlc's release workflow.
After 36 and 75.
