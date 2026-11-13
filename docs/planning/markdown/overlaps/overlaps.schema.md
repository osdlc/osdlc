---
$schema: https://json-schema.org/draft/2020-12/schema
title: Overlap
description: >-
  Two components that do some of the same job. The record's id is "<from> overlaps <to>", using
  the components' ids.
type: object
additionalProperties: false
x-id-pattern: "^[a-z0-9-]+ overlaps [a-z0-9-]+$"
required: [from, to, overlap, states, note]
properties:
  from:
    type: string
    x-ref: components
  to:
    description: The older or canonical component. An overlap has no direction.
    type: string
    x-ref: components
  overlap:
    description: >-
      copy when one is a copy or fork of the other, partial when different code solves part of the
      same problem.
    enum: [copy, partial]
  states:
    description: Present only means the plan removes the overlap. Both means it stays.
    type: array
    minItems: 1
    uniqueItems: true
    items: { enum: [present, target] }
  note:
    description: One plain sentence saying what overlaps, from a source someone can check.
    type: string
    minLength: 1
---

# Overlaps

One record per pair of components that duplicate some work. There is one record per pair, in
either order, and never one between twins: a twin pair is meant to be the same library in two
languages.

The note is in frontmatter, not the body, so code in it such as `[[target]]` stays plain text.
