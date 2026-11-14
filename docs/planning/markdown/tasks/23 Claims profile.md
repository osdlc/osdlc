---
number: 23
title: Claims profile
detail: npm package
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[21 Release here](21%20Release%20here.md)"
  - "[36 Release 0.4.0](36%20Release%200.3.0.md)"
prs:
  - "[osdlc/markdown#15](https://github.com/osdlc/markdown/pull/15)"
  - "[osdlc/osdlc#794](https://github.com/osdlc/osdlc/pull/794)"
  - "[osdlc/osdlc#804](https://github.com/osdlc/osdlc/pull/804)"
---

The claims profile. The example from task 4 is already in the right place. The profile's types are
open: a proposition's object can be any JSON value, and consumers add their own kinds. This follows
the downstream review in [osdlc/markdown#8](https://github.com/osdlc/markdown/issues/8). This task
adds the profile wrapper, a corpus with only types, as the package
`@osdlc/corpus-profile-claims`, versioned. The package was built in
[#15](https://github.com/osdlc/markdown/pull/15). Task 78 brought it to osdlc/osdlc, at
`packages/profiles/claims/`, with a changeset for its first release, 0.1.0. It publishes from there
([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)).
The claims example extends it by path. The owner staged the npm name (task 80) and published it
(task 60).
Corpora then list it by package name under `extends` in their root file and use `x-extends` instead
of holding full copies. harness-reference and the evidence project switch over. After 21 and 36:
the profile is checked with a corpus-schema that knows `extends`. It no longer waits on 31. The
profile can ship with its statements using relative links and a pattern check for evidence lines.
When 31 lands, a new profile version switches them to `x-ref`. What is left is the
switch-over of the corpora that copy the types (task 37).

Done: `@osdlc/corpus-profile-claims` 0.1.0 is on npm (2026-11-13), built from `packages/profiles/claims/`.
