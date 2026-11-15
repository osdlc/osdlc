---
name: "@osdlc/markdown-corpus"
kind: package
language: ts
layer: "[corpus-model](../layers/corpus-model.md)"
states: [target]
status: planned
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-corpus
twin: "[markdown-corpus-rs](markdown-corpus-rs.md)"
tasks:
  - "[12 One TS model](../tasks/12%20One%20TS%20model.md)"
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
  - "[14 Validator](../tasks/14%20Validator.md)"
  - "[15 Query layer](../tasks/15%20Query%20layer.md)"
  - "[72 Queries span references](../tasks/72%20Queries%20span%20references.md)"
  - "[32 Rust validator](../tasks/32%20Rust%20validator.md)"
depends_new:
  - "[markdown-link](markdown-link.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-link](markdown-link.md)"
    note: "Built on markdown-link's resolver (task 12)."
---

The planned TypeScript corpus model: markdown-vault and vault-graph-core made into one package,
built on markdown-link's resolver, the twin of the Rust crate.

## Notes

- Decision D3 names it markdown-corpus.
- The plan does not give a path. This follows osdlc/osdlc's `packages/ts/<name>` layout.
- Its shared test cases are planned as a conformance family.
