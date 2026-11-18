---
number: 16
title: JSON / SQLite
detail: after query layer
status: deferred
type: functional
milestone: "[m-query](../milestones/m-query.md)"
after:
  - "[15 Query layer](15%20Query%20layer.md)"
---

The JSON/SQLite build: write every valid record to JSON files and a SQLite file. After 15.

Deferred: it follows task 15, which is deferred. `@osdlc/corpus-query` (task 72) now answers queries over a corpus, so if this
build is wanted it is opened again on top of that package, not on markdown-vault-query.
