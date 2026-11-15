---
$schema: https://json-schema.org/draft/2020-12/schema
title: Dataset
description: >-
  Facts about one JSON file built from this corpus. The record's id is the file's name without
  .json: ecosystem or plan.
type: object
additionalProperties: false
x-id-pattern: "^[a-z0-9-]+$"
required: [as_of]
properties:
  as_of:
    description: The date the facts were last checked, as YYYY-MM-DD.
    type: string
    pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
  sources:
    description: What the facts were taken from.
    type: array
    items: { type: string, minLength: 1 }
---

# Datasets

One record for each file that `tools/explorer/scripts/build-data.mjs` writes.
