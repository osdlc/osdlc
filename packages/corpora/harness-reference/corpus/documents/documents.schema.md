---
$schema: https://json-schema.org/draft/2020-12/schema
title: Document
description: >-
  Something written that we can point at, such as a web page, a README, a paper or a manual.
  VA-Spec class Document, from the claims profile (osdlc/markdown, branch claims-example, commit
  663f5450a9f9fe777a4c86ace274508782e12346), plus the harness fields publisher, archive and url_status. The record's id, its file name,
  is a short display name for it.
type: object
additionalProperties: false
required: [title, urls, publisher]
properties:
  title:
    description: The title its authors gave it.
    type: string
    minLength: 1
  documentType:
    description: >-
      What kind of document it is, such as readme, manual, web page, paper, issue thread or
      research note. Free text.
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
    pattern: "^10\\.\\d+(\\.\\d+)*/[\\w\\-.;()/:<>]+$"
  publisher:
    description: Who publishes the page. For a harness's own pages, the harness's vendor.
    type: string
    minLength: 1
  archive:
    description: A Wayback Machine snapshot of the page (a Memento URI-M, which carries its date).
    type: string
    format: uri
    pattern: "^https://web\\.archive\\.org/web/[0-9]{14}/"
  url_status:
    description: Whether the page still loads.
    enum: [live, dead]
---

# Documents

One record per document. A document is a source: a web page, a README, a paper or a manual. A
document record says what the document is and where to find it. It says nothing about what the
document claims. That is a [study result](../study-results/study-results.schema.md), and many study
results can point at one document.

Records sit in one folder per publisher, named after the `publisher` value, such as
`documents/Anthropic/Claude Code overview.md`. The file name is a short display name for the
document, unique across every publisher folder. The document's own title goes in `title`.

This file's frontmatter is the schema. The first four fields (`title`, `documentType`, `urls`,
`doi`) are the claims profile's. `publisher`, `archive` and `url_status` are this corpus's own.

- A harness record lists the pages it was checked against in `sources`, as links to document
  records.
- `archive` and `url_status` are optional. Leave them out until someone checks.
- A research note kept in this repository is a document with `documentType: research note`. The
  note itself is a narrative file in `notes/`.
- `capture` (see the [README](../README.md)) adds a record when it is given a URL that has none.
