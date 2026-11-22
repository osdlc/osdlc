---
$schema: https://json-schema.org/draft/2020-12/schema
title: Subject
description: >-
  One question asked of every store, and the shape of its answer, subjects/<category>/<name>.md.
  The id is the file name: a short display name.
type: object
additionalProperties: false
required: [slug, category, description, valueSchema]
properties:
  slug:
    description: >-
      A stable key, <category>/<name>: lowercase letters, digits and hyphens. A statement's
      predicate is this slug.
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$"
  category:
    description: The group the subject belongs to, such as location or clean. The slug starts with it.
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*$"
  description:
    description: The question, in a sentence.
    type: string
    minLength: 1
  applies_to:
    description: >-
      The store categories the question is asked of. Omitted means every store.
    type: array
    minItems: 1
    items: { type: string, minLength: 1 }
  valueSchema:
    description: A JSON Schema (draft 2020-12) for the object of a statement about this subject.
    type: object
---

# Subjects

One record per question, such as "Data directories" or "Clean command". A
[statement](../statements/statements.schema.md) answers it for one store. The subject holds the
shape of the answer in `valueSchema`.

Records sit in one folder per category: `subjects/location/Data directories.md`.

- `slug` is `<category>/<name>`, such as `location/data-dirs`.
- `valueSchema` starts with the keys seen so far. Tighten it by hand once the shape settles.
- `applies_to` limits a question to some store categories. Build directories inside a project,
  for one, are asked only of language tools.
