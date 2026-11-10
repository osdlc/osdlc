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
implements:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: implements
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
---

A valid level-2 corpus with the claims types: documents, methods, study-results and statements. Its
records check a made-up claim about a tool called fernlog.

## Notes

- The types follow GA4GH's VA-Spec 1.1.0 (decision D8). profiles/claims/README.md maps each type and
  field to VA-Spec.
- Merged in osdlc/markdown#6. The plan still calls task 4 in progress.
- People copy it with npx degit osdlc/markdown/profiles/claims/example. It is not on a registry.
- profiles/claims/tests/ holds broken records that must fail with one expected error each.
- Until task 31, evidence items are relative links with a pattern check, not x-ref.
