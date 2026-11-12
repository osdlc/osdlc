---
number: 78
title: Models repo setup
detail: osdlc/models release and CI
status: todo
type: supporting
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
  - "[75 Create models repo](75%20Create%20models%20repo.md)"
---

Set up [osdlc/models](https://github.com/osdlc/models) so the profiles and the starter publish from
it (decision D17). Copy the release tooling from osdlc/markdown: changesets, the packages workflow
and package-checks. Move in `profiles/sdlc/`, `profiles/claims/` and `corpora/sdlc-starter/` from
[#19](https://github.com/osdlc/markdown/pull/19) and
[#15](https://github.com/osdlc/markdown/pull/15). Add CI that validates them with corpus-schema
0.3.0 from npm. No version is published from osdlc/markdown. The trusted publishers (task 59) point
at the workflow this task adds. After 36 and 75.
