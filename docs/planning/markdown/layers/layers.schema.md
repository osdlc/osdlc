---
$schema: https://json-schema.org/draft/2020-12/schema
title: Layer
description: One layer of the architecture. The record's id is a slug, such as note-parts.
type: object
additionalProperties: false
x-id-pattern: "^[a-z0-9-]+$"
required: [label, order]
properties:
  label:
    description: The name people see, such as "2. Note parts".
    type: string
    minLength: 1
  order:
    description: Where the layer sits, from the top. 1 is the top layer.
    type: integer
    minimum: 1
---

# Layers

One record per layer of the
[architecture](https://github.com/osdlc/markdown/blob/main/docs/architecture.md). The body says in
one sentence what the layer does.
