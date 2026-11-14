---
$schema: https://json-schema.org/draft/2020-12/schema
title: Note
description: A reading note. Each one names the books it is about.
type: object
x-record-file: README.md
required: [about, written]
properties:
  about:
    description: Links to the books the note is about.
    type: array
    minItems: 1
    items: { type: string, x-ref: books }
  written:
    description: The date the note was written.
    type: string
    format: date
  kind:
    description: What sort of note it is.
    enum: [quote, summary, question]
---

# Notes

One record per note. A note that keeps other files, such as a scan, is a folder with a
`README.md`.
