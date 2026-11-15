---
name: harness-reference beta corpus
kind: corpus
language: markdown
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: published
repo_present: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_present: harness-reference/corpora/beta
repo_target: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_target: harness-reference/corpora/beta
tasks:
  - "[8 Use npm](../tasks/8%20Use%20npm.md)"
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[26 Adopt claims](../tasks/26%20Adopt%20claims.md)"
links:
  - "[osdlc/skillwright#97](https://github.com/osdlc/skillwright/pull/97)"
  - "[osdlc/skillwright#74](https://github.com/osdlc/skillwright/pull/74)"
implements:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
extends_going:
  - "[claims-example](claims-example.md)"
edge_notes:
  - edge: implements
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A level-2 corpus.
  - edge: extends_going
    to: "[claims-example](claims-example.md)"
    note: >-
      By copying the four type folders (pinned to commit 663f545) and adding harness fields. There
      is no extends mechanism yet.
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: "Through extends: and x-extends (task 23)."
---

harness-reference's level-2 corpus: harnesses, subjects, and the claims types (documents, methods,
study-results, statements) with harness fields added.

## Notes

- osdlc/skillwright#97 (2026-11-09) moved it to the claims types: references became documents,
  evidence became study-results. Its schemas are copied from the claims example at commit 663f545.
  The plan still lists task 26 as not started.
- The alpha corpus beside it has no root file and is not a corpus-schema corpus.
- Open osdlc/skillwright PRs #98 and #100 to #106 add research records to it.
