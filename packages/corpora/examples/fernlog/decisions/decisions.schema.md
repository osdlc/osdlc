---
$schema: https://json-schema.org/draft/2020-12/schema
title: Decision
description: >-
  A design decision the project made. The record's id, its file name, says what was decided.
type: object
required: [status, decided, follows]
properties:
  status:
    description: Whether the decision holds.
    enum: [proposed, accepted, replaced]
  decided:
    description: The date the decision was made.
    type: string
    format: date
  follows:
    description: Links to the org principles the decision follows.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: org/principles
  checkedBy:
    description: Links to statements that check the behaviour the decision asks for.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: claims/statements
---

# Decisions

One record per design decision. `follows` links to the org principles the decision follows. Each
link goes through `_inherited/org/`, the copy of the org corpus. `checkedBy` links to the project's
statements that check the result.
