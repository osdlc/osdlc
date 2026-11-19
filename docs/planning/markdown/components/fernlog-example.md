---
name: fernlog example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: in-progress
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/corpora/examples/fernlog
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/corpora/examples/fernlog
tasks:
  - "[35 Example pair](../tasks/35%20Example%20pair.md)"
  - "[79 Markdown after the move](../tasks/79%20Markdown%20after%20the%20move.md)"
links:
  - "[osdlc/markdown#16](https://github.com/osdlc/markdown/pull/16)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
reads_new:
  - "[org-principles-example](org-principles-example.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: By the package name, installed with a file dependency on packages/profiles/claims. Task 79 switches it to npm.
  - edge: reads_new
    to: "[org-principles-example](org-principles-example.md)"
    note: "Under references: as org (D15), by the path ../org-principles."
---

A project corpus for a made-up tool. It extends the claims profile and references the example org
principles. Its decisions and statements cite the org's principles. CI installs the claims
profile, runs corpus-schema sync and validates both corpora.

## Notes

- Built in osdlc/markdown#16 at examples/fernlog, not merged there. It came to osdlc/osdlc with its
  history (decision D19, task 78), at packages/corpora/examples/fernlog. It is not a workspace
  member: it installs the claims profile with its own lockfile. It holds a committed
  _references/org/ copy of the org principles. The claims profile gets no copy, since it gives
  types only.
- packages/corpora/examples/test.sh breaks one thing at a time and checks each case fails with its
  one expected error. .github/workflows/profiles.yml runs it.
- It is the start of task 30.
