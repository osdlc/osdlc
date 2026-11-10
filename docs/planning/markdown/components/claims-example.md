---
name: claims example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: published
repo_present: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_present: profiles/claims/example
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: profiles/claims/example
tasks:
  - "[4 Claims example](../tasks/4%20Claims%20example.md)"
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[31 Nested x-ref](../tasks/31%20Nested%20x-ref.md)"
links:
  - "[osdlc/markdown#6](https://github.com/osdlc/markdown/pull/6)"
  - "[osdlc/markdown#8 (issue)](https://github.com/osdlc/markdown/issues/8)"
  - "[osdlc/markdown#15](https://github.com/osdlc/markdown/pull/15)"
implements:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
edge_notes:
  - edge: implements
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: >-
      By the path ../corpus. Its four schemas hold only x-extends: claims/<type>
      (osdlc/markdown#15).
---

A valid level-2 corpus with the claims types: documents, methods, study-results and statements. Its
records check a made-up claim about a tool called fernlog.

## Notes

- The types follow GA4GH's VA-Spec 1.1.0 (decision D8). profiles/claims/README.md maps each type and
  field to VA-Spec.
- Merged in osdlc/markdown#6. The plan still calls task 4 in progress.
- Until osdlc/markdown#15 merges, people copy it with npx degit osdlc/markdown/profiles/claims/example.
  After it, the example holds no type copies, so the profile package is the thing to extend. It is
  not on a registry.
- profiles/claims/tests/ holds broken records that must fail with one expected error each.
- Its CI builds this repo's corpus-schema, because the published 0.2.x does not read extends.
- Until task 31, evidence items are relative links with a pattern check, not x-ref.
