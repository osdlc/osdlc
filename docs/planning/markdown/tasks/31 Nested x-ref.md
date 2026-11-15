---
number: 31
title: Nested x-ref
detail: "any depth; after 3, 4"
status: todo
type: functional
milestone: "[m-spec](../milestones/m-spec.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
  - "[4 Claims example](4%20Claims%20example.md)"
---

Nested x-ref. corpus-schema v0 allows `x-ref` only on top-level fields and the items of top-level
arrays. The claims example needs it inside each statement's evidence lines (`hasEvidenceItems`).
Allow `x-ref` at any depth in a schema, then switch the example's evidence items from relative links
with a pattern check to `x-ref`. After 3 and 4. It is not part of the npm milestone. The claims
profile ships first with the pattern check, and a later profile version uses `x-ref`.
