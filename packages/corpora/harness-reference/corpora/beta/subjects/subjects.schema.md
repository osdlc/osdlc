---
$schema: https://json-schema.org/draft/2020-12/schema
title: Subject
description: >-
  One question asked of every harness, and the shape of its answer, subjects/<category>/<name>.md.
  The id is the file name: a short display name.
type: object
additionalProperties: false
required: [slug, category, description, valueSchema]
properties:
  slug:
    description: >-
      A stable key, <category>/<name>: lowercase letters, digits and hyphens. A statement's
      predicate is this slug, and the compiled knowledge file keys on it.
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$"
  category:
    description: The group the subject belongs to, such as cli or skills. The slug starts with it.
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*$"
  description:
    description: The question, in a sentence.
    type: string
    minLength: 1
  model_dependent:
    description: >-
      Whether the model matters as much as the harness, so a statement may name a model in its
      scope.
    type: boolean
  valueSchema:
    description: >-
      A JSON Schema (draft 2020-12) for the object of a statement about this subject. `lint`
      checks every statement against it.
    type: object
---

# Subjects

One record per question, such as "Resume a session" or "Session environment". A
[statement](../statements/statements.schema.md) answers it for one harness. The subject holds the
shape of the answer in `valueSchema`, so a lint can check every statement's value.

Records sit in one folder per category: `subjects/cli/Session environment.md`.

- `slug` is `<category>/<name>`, the same id alpha used, such as `cli/session-env`.
- `valueSchema` starts permissive: an object schema with the keys and types seen so far. Tighten it
  by hand once the shape settles.
- `model_dependent` is set only where the model matters as much as the harness, such as picking a
  skill from its description.
