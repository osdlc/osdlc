---
"@osdlc/corpus-schema": minor
---

`loadCorpus(root)` returns one corpus as plain data, so a site build, a query tool or a server can
work from it without parsing anything again. The model holds the corpus (name, level, identity,
version, and the errors and warnings `validateCorpus` reports), each type (its own schema, its
flattened schema, its chain, where it comes from, and its fields with their `x-ref`), and each
record (id, type, path, format, data, Markdown body, record folder and its files). Every value of
an `x-ref` field and every body link to a record is resolved to its target, or carries the reason
it names none, and each record lists what points at it. Records of referenced corpora are in the
model too, by prefix, each corpus once. The model has a fixed order and survives
`JSON.stringify`. A corpus with errors still loads, with `valid: false` on the records that have
them. `getCorpus`, `getType`, `recordsOf`, `getRecord` and `resolveTarget` look things up in a
model. `loadCorpus` writes nothing and does not need the `_references/` copies. These exports are
experimental. `validateCorpus` reports what it did before.
