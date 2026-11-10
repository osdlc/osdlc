---
name: "@osdlc/corpus-schema"
kind: package
language: ts
layer: "[spec](../layers/spec.md)"
states: [present, target]
status: published
version: "0.2.0"
registry: "https://www.npmjs.com/package/@osdlc/corpus-schema"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/corpus-schema
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: packages/ts/corpus-schema
twin: "[corpus-schema-rs](corpus-schema-rs.md)"
tasks:
  - "[1 corpus-schema](../tasks/1%20corpus-schema.md)"
  - "[2 Record folders](../tasks/2%20Record%20folders.md)"
  - "[3 Publish 0.2.0](../tasks/3%20Publish%200.2.0.md)"
  - "[6 x-warn](../tasks/6%20x-warn.md)"
  - "[7 Obsidian](../tasks/7%20Obsidian.md)"
  - "[9 Extends](../tasks/9%20Extends.md)"
  - "[14 Validator](../tasks/14%20Validator.md)"
  - "[21 Release here](../tasks/21%20Release%20here.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
  - "[27 Org corpora](../tasks/27%20Org%20corpora.md)"
  - "[28 Refine, waive](../tasks/28%20Refine,%20waive.md)"
  - "[29 Sync](../tasks/29%20Sync.md)"
  - "[31 Nested x-ref](../tasks/31%20Nested%20x-ref.md)"
  - "[33 Spec details](../tasks/33%20Spec%20details.md)"
  - "[34 Ids and move](../tasks/34%20Ids%20and%20move.md)"
links:
  - "[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9)"
  - "[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10)"
  - "[osdlc/osdlc#725](https://github.com/osdlc/osdlc/pull/725)"
  - "[osdlc/osdlc#729](https://github.com/osdlc/osdlc/pull/729)"
  - "[osdlc/osdlc#733](https://github.com/osdlc/osdlc/pull/733)"
depends:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-link](markdown-link.md)"
depends_new:
  - "[markdown-corpus](markdown-corpus.md)"
implements:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
validates:
  - "[harness-beta-corpus](harness-beta-corpus.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: "Task 14: the validator reads the corpus model instead of walking the folder."
  - edge: validates
    to: "[harness-beta-corpus](harness-beta-corpus.md)"
    note: "harness-reference's validate:beta script."
---

The validator for the corpus-schema spec, as a library and the corpus-schema command. It checks
records against their schemas, ids, links and typed references.

## Notes

- 0.2.0 is its first version on npm. 0.1.0 was cut but never published (task 3).
- Today it walks the folder and checks links itself (problem F8). Task 14 makes it read the corpus
  model instead.
- Near target: open osdlc/markdown#9 moves it here with the same npm name, and open
  osdlc/markdown#10 builds and releases it with the shared osdlc workflows. Until those land,
  releases go out from osdlc/osdlc.
- On the osdlc/markdown#9 branch its osdlc dependencies change from workspace:^ to npm ranges
  (^1.1.2 and ^0.8.1).
- osdlc/markdown builds and releases it with the shared osdlc workflows, ts-packages-ci and
  ts-packages-release (task 21).
- validate --fix exists today. Task 29 adds the corpus-schema sync command: it writes a read-only
  copy of inherited records into a generated folder, such as _inherited/org/, so Obsidian and GitHub
  links resolve. The validator then checks that the copy matches the pinned parent. Task 34 adds a
  move verb.
