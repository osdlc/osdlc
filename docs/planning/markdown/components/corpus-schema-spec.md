---
name: "corpus-schema spec (SPEC.md)"
kind: spec
language: markdown
layer: "[spec](../layers/spec.md)"
states: [present, target]
status: published
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/conformance/corpus-schema
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/conformance/corpus-schema
tasks:
  - "[1 corpus-schema](../tasks/1%20corpus-schema.md)"
  - "[2 Record folders](../tasks/2%20Record%20folders.md)"
  - "[6 x-warn](../tasks/6%20x-warn.md)"
  - "[7 Obsidian](../tasks/7%20Obsidian.md)"
  - "[9 Extends](../tasks/9%20Extends.md)"
  - "[21 Release here](../tasks/21%20Release%20here.md)"
  - "[27 Org corpora](../tasks/27%20Org%20corpora.md)"
  - "[28 Refine, waive](../tasks/28%20Refine,%20waive.md)"
  - "[31 Nested x-ref](../tasks/31%20Nested%20x-ref.md)"
  - "[33 Spec details](../tasks/33%20Spec%20details.md)"
  - "[34 Ids and move](../tasks/34%20Ids%20and%20move.md)"
  - "[44 Flatten extends](../tasks/44%20Flatten%20extends.md)"
  - "[45 Refs by id](../tasks/45%20Refs%20by%20id.md)"
  - "[46 Multi-type x-ref](../tasks/46%20Multi-type%20x-ref.md)"
  - "[57 x-body](../tasks/57%20x-body.md)"
links:
  - "[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9)"
  - "[osdlc/osdlc#725](https://github.com/osdlc/osdlc/pull/725)"
  - "[osdlc/osdlc#729](https://github.com/osdlc/osdlc/pull/729)"
---

The rules for what a corpus can declare about itself: a root file, type folders, record ids, record
folders, JSON Schemas per type and typed links (x-ref). Its test cases sit beside it.

## Notes

- Version 0 is in force (corpus-schema: 0). It has levels 0 to 2.
- It stays in osdlc/osdlc (decision D19). The copy in osdlc/markdown (osdlc/markdown#9) is retired
  once its open work is brought here.
- Proposals not built yet: a baseline and dialects (task 7), profiles through the extends key (task
  9), and sharing whole corpora (tasks 27 to 30).
- A plain-language guide is at packages/ts/corpus-schema/docs/guide/corpus-schema.md.
