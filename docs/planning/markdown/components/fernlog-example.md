---
name: fernlog example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: in-progress
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: examples/fernlog
tasks:
  - "[35 Example pair](../tasks/35%20Example%20pair.md)"
links:
  - "[osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
  - "[org-principles-example](org-principles-example.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: By the package name, installed with a file dependency on profiles/claims.
  - edge: extends_new
    to: "[org-principles-example](org-principles-example.md)"
    note: By the path ../org-principles.
---

A project corpus for a made-up tool. It extends the claims profile and the example org principles.
Its decisions and statements cite inherited principles. CI installs the parents, runs
corpus-schema sync and validates both corpora.

## Notes

- Built in osdlc/markdown#16, not merged. It holds a committed _inherited/ copy of both parents.
- examples/test.sh breaks one thing at a time and checks each case fails with its one expected error.
- It is the start of task 30.
