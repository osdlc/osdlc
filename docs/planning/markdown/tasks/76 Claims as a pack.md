---
number: 76
title: Claims as a pack
detail: pack-claims
status: todo
type: functional
milestone: "[m-model-layer](../milestones/m-model-layer.md)"
after:
  - "[23 Claims profile](23%20Claims%20profile.md)"
  - "[62 Packs in public](62%20Packs%20in%20public.md)"
---

Write the claims types as `pack-claims`, and generate `@osdlc/corpus-profile-claims` from it. The
package name does not change, so corpora that extend it see no change. The type folders of the
profile become generated output, as decided in [D17](../decisions/D17%20Profiles%20and%20corpora%20live%20in%20osdlc%20models.md). D17 put `pack-claims` in osdlc/models.
[D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md) folds that repo into osdlc/osdlc and keeps model-schema and the packs in sksizer/dev for now,
so where `pack-claims` lives is not decided. After 23 and 62.
