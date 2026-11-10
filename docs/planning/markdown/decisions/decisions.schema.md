---
$schema: https://json-schema.org/draft/2020-12/schema
title: Decision
description: >-
  A choice the plan made, or one still open. The record's id is "D", the number, a space and the
  title, such as "D4 Types are plain JSON Schema". The number never changes.
type: object
additionalProperties: false
x-id-pattern: "^D[0-9]+ \\S"
required: [title, status]
properties:
  title:
    type: string
    minLength: 1
  status:
    enum: [decided, open]
  decided:
    description: The date it was decided, as YYYY-MM-DD, when the plan recorded one.
    type: string
    pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
---

# Decisions

One record per decision. The body states the decision and the reasons for it.
