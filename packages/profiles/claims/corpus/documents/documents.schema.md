---
$schema: https://json-schema.org/draft/2020-12/schema
title: Document
description: >-
  Something written that we can point at, such as a web page, a README, a paper or a manual. VA-Spec
  class Document. The record's id, its file name, is a short display name for it.
type: object
required: [title]
properties:
  title:
    description: The title its authors gave it.
    type: string
    minLength: 1
  documentType:
    description: >-
      What kind of document it is, such as readme, manual, web page, paper or issue thread. Free
      text.
    type: string
    minLength: 1
  urls:
    description: One or more URLs where the document can be read.
    type: array
    minItems: 1
    items:
      type: string
      format: uri
      pattern: "^(https?|s?ftp)://"
  doi:
    description: The document's Digital Object Identifier, for a paper that has one.
    type: string
    pattern: "^10.(\\d+)(\\.\\d+)*/[\\w\\-\\.]+"
---

# Documents

One record per document. A document is a source: a web page, a README, a paper or a manual. A
document record says what the document is and where to find it. It says nothing about what the
document claims. That is a [study result](../study-results/study-results.schema.md), and many study
results can point at one document.

The file name is the record's id. Make it a short name people will recognise, such as
`fernlog README`. The document's own title goes in `title`.

The Markdown body is free. Use it for notes about the document, such as which version of a page
you read.
