---
name: "@osdlc/corpus-profile-claims"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: in-progress
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: profiles/claims
tasks:
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
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
- Not published. Publishing needs profiles/* in the workspace and the owner staging the npm name
  once. package-checks does not check a package with no code.
