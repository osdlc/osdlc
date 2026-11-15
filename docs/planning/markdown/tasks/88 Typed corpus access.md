---
number: 88
title: Typed corpus access
detail: "types from the schemas"
status: todo
type: functional
milestone: "[m-query](../milestones/m-query.md)"
---

Give TypeScript code that reads a corpus the types of its records, so a field is read as a typed
field and not through a cast.

`loadCorpus` ([osdlc/osdlc#805](https://github.com/osdlc/osdlc/pull/805)) returns each record's
`data` as an untyped object. Each type already has a flattened JSON Schema in the loaded model, so
the types can be made from it. This task starts after the open pull requests are caught up.

What to do, in order:

1. **A type parameter on the loader.** `loadCorpus<Types>(root)`, so `recordsOf(model, 'tasks')`
   returns records whose `data` is the task type. Add a strict mode that gives out only records
   that passed their schema: the loader returns invalid records too, with `valid: false`, and a
   generated type is true only of a valid one.
2. **A generator.** A command that reads a corpus and writes a `.d.ts`: one interface per type,
   with the types it gets through `extends` and `uses`, and a map from type name to interface. A
   field with `x-ref` gets the id type of the type it points at. Use `json-schema-to-typescript`
   for the schema-to-interface step. It is its own package or a part of `corpus-query`, so the
   validator gains no dependency. CI fails when a committed file differs from what the schemas
   give, as `check:data` does for the harness knowledge file.
3. **Try it on the harness reference's own code.**
   `packages/corpora/harness-reference/src` compiles, lints and captures the corpus with its own
   110-line loader and about 70 casts and string-keyed reads, counted when #805 merged. Replace the
   loader with `loadCorpus` and the casts with the generated types.
4. **Typed `fact()` in `@osdlc/harness-knowledge`.** Each subject holds a `valueSchema`
   for its answer. The compile step also writes a union of the subject slugs, a map from slug to
   value type, and a union of the harness ids. `detect-harness` reads
   `fact(harness, 'skills/user-dirs')?.['dirs']` today, and is the consumer that shows it works.
   Most value schemas require no key and allow others, so the types are mostly optional fields.
5. **Profile packages ship their types**, so a consumer imports a record type from
   `@osdlc/corpus-profile-claims`.

Later, and optional: a Zod entry point for a corpus written from Zod models (model-schema in
sksizer/dev), where the caller's Zod schemas parse each record that passed the schema check. Zod is
not run over a corpus whose schemas are JSON Schema files: the JSON Schema check stays the one
that decides.

Done when the harness reference's code and `detect-harness` read the corpus through generated
types, and CI holds those types to the schemas.
