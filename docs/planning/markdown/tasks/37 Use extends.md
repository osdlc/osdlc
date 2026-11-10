---
number: 37
title: Use extends
detail: harness-reference
status: todo
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[23 Claims profile](23%20Claims%20profile.md)"
  - "[26 Adopt claims](26%20Adopt%20claims.md)"
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
---

harness-reference uses `extends`. Follow-up to task 26: harness-reference stops copying the claims
type folders. It installs `@osdlc/corpus-profile-claims`, lists it under `extends` and marks its
types with `x-extends`. After 23, 26 and 36.
