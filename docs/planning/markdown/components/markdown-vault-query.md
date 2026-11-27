---
name: "@osdlc/markdown-vault-query"
kind: package
language: ts
layer: "[query](../layers/query.md)"
states: [present, target]
status: unpublished
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-vault-query
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-vault-query
tasks:
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
  - "[15 Query layer](../tasks/15%20Query%20layer.md)"
  - "[16 JSON and SQLite](../tasks/16%20JSON%20and%20SQLite.md)"
  - "[72 Queries span references](../tasks/72%20Queries%20span%20references.md)"
depends:
  - "[path-guard](path-guard.md)"
depends_new:
  - "[markdown-corpus](markdown-corpus.md)"
depends_going:
  - "[markdown-vault](markdown-vault.md)"
reads_new:
  - "[corpus-schema-ts](corpus-schema-ts.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: "Task 15: the query layer sits on the corpus model."
  - edge: reads_new
    to: "[corpus-schema-ts](corpus-schema-ts.md)"
    note: The architecture says the query layer reads the corpus model and corpus-schema.
---

Runs Obsidian Bases (.base) queries over a vault. In the target it becomes the one query layer, on
top of the corpus model.

## Notes

- Version 0.4.1 in osdlc; not on npm. Its first release is 0.5.0.
- Problem F9: two query layers (this and a loader corpus-schema planned).
- It moved to osdlc/osdlc from sksizer/dev on 2026-11-22, under its present name and on top of
  markdown-vault
  ([D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md),
  amended). Its first release lists the API changes made on the way. Task 15 puts it on top of
  the corpus model. Its target name is not decided; the
  architecture keeps the word db for this layer, and decision D5 (what db means) is open.
- Task 16 adds a build that writes every valid record to JSON files and a SQLite file.
