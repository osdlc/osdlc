---
'@osdlc/corpus-schema': minor
---

Add `corpus-schema types [--out <file>] <folder>` and `generateTypes(model)`: TypeScript types for a corpus's records, generated from its type schemas. One interface per type with the fields of the whole `x-extends` chain, `Ref<T>` for `x-ref` fields, and a `CorpusTypes` map from type name to interface.
