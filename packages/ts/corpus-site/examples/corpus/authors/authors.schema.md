---
$schema: https://json-schema.org/draft/2020-12/schema
title: Author
description: One writer. The record's id, its file name, is the name the writer published under.
type: object
required: [born, country]
properties:
  born:
    description: The year the writer was born.
    type: integer
  died:
    description: The year the writer died.
    type: integer
  country:
    description: The country the writer is most tied to.
    type: string
  pen_name:
    description: Whether the id is a pen name.
    type: boolean
---

# Authors

One record per writer of a book on the shelf.
