---
name: "@osdlc/corpus-profile-claims"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: unpublished
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/profiles/claims
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/profiles/claims
tasks:
  - "[79 Markdown after the move](../tasks/79%20Markdown%20after%20the%20move.md)"
  - "[78 Bring in profiles](../tasks/78%20Models%20repo%20setup.md)"
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
  - "[80 Profile publishers](../tasks/80%20Models%20publishers.md)"
  - "[60 Publish claims](../tasks/60%20Publish%20claims.md)"
  - "[76 Claims as a pack](../tasks/76%20Claims%20as%20a%20pack.md)"
links:
  - "[osdlc/markdown#15](https://github.com/osdlc/markdown/pull/15)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A profile is a corpus that has only types.
---

The claims types published as a versioned profile, so a corpus names it under extends: and marks its
types with x-extends instead of copying them.

## Notes

- Decision D10 fixed the name, the folder and the prefix claims. The architecture still marks the
  profiles layer a proposal, and its open questions ask whether to adopt profiles.
- Built in osdlc/markdown#15. The four type schemas are in its corpus/ folder, which package.json
  names with "corpus". The claims example extends it.
- Task 76 rewrites it as pack-claims.
- It came to osdlc/osdlc (decision D19, task 78), at packages/profiles/claims, with a changeset for
  its first release, 0.1.0.
- Not published. The owner stages the name and sets its trusted publisher (task 80), and the release
  needs osdlc/osdlc#785. The npm name does not change.
