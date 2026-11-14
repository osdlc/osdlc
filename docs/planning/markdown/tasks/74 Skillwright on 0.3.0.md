---
number: 74
title: Skillwright on 0.4.0
detail: skillwright
status: dropped
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[36 Release 0.4.0](36%20Release%200.3.0.md)"
  - "[60 Publish claims](60%20Publish%20claims.md)"
---

Skillwright's `harness-reference/corpus` (in osdlc/skillwright) validates with `@osdlc/corpus-schema`
`^0.2.0` from npm. Move it to 0.4.0, which is published. Later, extend the claims profile: its
claims types come from `@osdlc/corpus-profile-claims` (task 60) instead of copies. After 36 and 60.

Dropped: the harness reference moved to osdlc/osdlc (`packages/corpora/harness-reference/`), where it validates with this repository's
corpus-schema, and left osdlc/skillwright ([osdlc/skillwright#164](https://github.com/osdlc/skillwright/pull/164)). Whether it extends the claims profile is an open item in
[the repatriation plan](https://github.com/osdlc/osdlc/blob/main/docs/planning/repatriation.md).
