---
name: "@osdlc/corpus-profile-claims"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: proposal
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: profiles/claims
tasks:
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
depends_new:
  - "[claims-example](claims-example.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: depends_new
    to: "[claims-example](claims-example.md)"
    note: "Task 23 wraps the example's types as a corpus with only types."
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A profile is a corpus that has only types.
---

The claims types published as a versioned profile, so a corpus names it under extends: and marks its
types with x-extends instead of copying them.

## Notes

- Decision D10 fixed the name, the folder and the prefix claims. The architecture still marks the
  profiles layer a proposal, and its open questions ask whether to adopt profiles.
- Task 23 publishes it from this repo, after tasks 9, 21 and 31. If copies drift first, it could be
  released from osdlc/osdlc.
- Not on npm.
