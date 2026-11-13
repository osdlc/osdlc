---
name: org principles example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: in-progress
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: examples/org-principles
tasks:
  - "[35 Example pair](../tasks/35%20Example%20pair.md)"
links:
  - "[osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus with one type, principles, and three records.
---

An example organisation's principles: a corpus with one type and three records. The fernlog example
extends it by path.

## Notes

- Built in osdlc/markdown#16, not merged.
- An example, not the shared org corpus. That one is the org principles corpus (task 30).
