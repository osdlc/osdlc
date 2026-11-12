---
name: "@osdlc/corpus-profile-claims"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: in-progress
repo_target: "[osdlc/models](../repos/osdlc-models.md)"
path_target: profiles/claims
tasks:
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
  - "[59 Trusted publishing](../tasks/59%20Trusted%20publishing.md)"
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
- Built in osdlc/markdown#15 as package 0.1.0 at profiles/claims. The four type schemas are in its
  corpus/ folder, which package.json names with "corpus". The claims example extends it.
- Task 76 rewrites it as pack-claims and moves it to osdlc/models (decision D17).
- Not published. Publishing needs profiles/* in the workspace and the owner staging the npm name
  once. package-checks does not check a package with no code.
