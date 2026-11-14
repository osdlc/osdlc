---
number: 37
title: Use extends
detail: harness-reference
status: todo
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[26 Adopt claims](26%20Adopt%20claims.md)"
  - "[36 Release 0.4.0](36%20Release%200.3.0.md)"
  - "[60 Publish claims](60%20Publish%20claims.md)"
---

harness-reference uses `extends`. Follow-up to task 26: harness-reference stops copying the claims
type folders. It installs `@osdlc/corpus-profile-claims`, lists it under `extends` and marks its
types with `x-extends`. After 26, 36 and 60, which publishes the profile that 23 builds.
