---
name: acceptance-testing profile
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: proposal
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
tasks:
  - "[25 Testing profile](../tasks/25%20Testing%20profile.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
edge_notes:
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: It adds to claims and never loosens a rule.
---

A proposed profile built on claims: acceptance criteria are what statements are about, tests are
methods and test runs are study results.

## Notes

- The architecture diagram places it in osdlc/markdown. The plan gives no package name or path.
