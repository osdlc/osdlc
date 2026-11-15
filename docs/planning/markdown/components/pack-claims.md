---
name: "@osdlc/pack-claims"
kind: profile
language: yaml
layer: "[model](../layers/model.md)"
states: [target]
status: planned
tasks:
  - "[76 Claims as a pack](../tasks/76%20Claims%20as%20a%20pack.md)"
depends_new:
  - "[model-schema](model-schema.md)"
---

The claims types written as a pack. `@osdlc/corpus-profile-claims` is generated from it.

## Notes

- Where it lives is not decided. The packs stay in sksizer/dev for now, and osdlc/models is a
  holding pen (decision D19).
- Decision D17. The profile's type folders become generated output (task 76).
