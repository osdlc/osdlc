---
number: 52
title: Work extends
detail: "from npm, on 0.3.0"
status: todo
type: functional
milestone: "[m-sdlc-profile](../milestones/m-sdlc-profile.md)"
after:
  - "[49 SDLC profiles](49%20SDLC%20profiles.md)"
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
  - "[61 Publish sdlc](61%20Publish%20sdlc.md)"
---

The work repo keeps its sdlc records as a corpus. It installs the sdlc profile from npm, names it under
`extends`, takes its types with `uses: [sdlc/*]` (task 71, decision D15) and uses corpus-schema
0.3.0. This is the first use of the sdlc corpus at work. Before 1.0 there is no older form to start on, so it waits
for 49, 36 and 61, which publishes the profile.
