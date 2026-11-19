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

The owner confirmed this on 2026-11-14. The corpus is now in osdlc/osdlc
(`packages/corpora/harness-reference/`). It was tried during the move and left out, for two reasons
this task has to settle first:

- The profile's `doi` pattern refuses DOIs that the corpus's own pattern accepts. Loosen the
  profile's pattern, or correct the records, whichever the DOIs show is right.
- A copy of the corpus outside the workspace no longer validates, because it cannot find the
  profile. The corpus's tests and `sync --commit` validate such a copy.

The compiled harness knowledge file must come out the same.
