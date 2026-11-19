---
$schema: https://json-schema.org/draft/2020-12/schema
title: Book
description: One book on the shelf. The record's id, its file name, is the book's title.
type: object
additionalProperties: false
required: [author, status, year]
properties:
  author:
    description: A link to the person who wrote the book.
    type: string
    x-ref: authors
  status:
    description: How far the reading has got.
    oneOf:
      - { const: to-read, title: To read }
      - { const: reading, title: Reading }
      - { const: finished, title: Finished }
      - { const: abandoned, title: Abandoned }
  year:
    description: The year the book was first published.
    type: integer
  pages:
    description: The page count of the edition on the shelf.
    type: integer
  fiction:
    description: Whether the book is fiction.
    type: boolean
  genres:
    description: The shelves the book sits on.
    type: array
    items: { enum: [novel, essays, science, history, poetry] }
  finished:
    description: The date the last page was read.
    type: string
    format: date
  rating:
    description: A mark out of five, given once the book is finished.
    type: integer
    minimum: 1
    maximum: 5
  source:
    description: Where a free copy can be read.
    type: string
    format: uri
  edition:
    description: The copy on the shelf.
    type: object
    properties:
      publisher: { type: string }
      format: { enum: [paperback, hardback, ebook] }
---

# Books

One record per book. The Markdown body says what the book is and why it is on the shelf.
