---
$schema: https://json-schema.org/draft/2020-12/schema
title: Reference
description: >-
  One web page we can point at, references/<publisher>/<name>.md. The id is the file name: a short
  display name for the page.
type: object
additionalProperties: false
required: [url, title, publisher]
properties:
  url:
    description: The page's address.
    $ref: "#/$defs/https-url"
  title:
    description: The page's title.
    type: string
    minLength: 1
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
$defs:
  https-url:
    type: string
    format: uri
    pattern: "^https://"
---

# References

One record per web page: a vendor's site, docs page, repository, license file or release list. A
reference says where a page is. It says nothing about what the page claims; that is an
[evidence](../evidence/evidence.schema.md) record, and many evidence records can point at one page.

Records sit in one folder per publisher, named after the `publisher` value, such as
`references/Anthropic/Claude Code overview.md`. The file name is a short display name for the page,
unique across every publisher folder. The page's own title goes in `title`.

This file's frontmatter is the schema. The rules below are the ones a description does not say
clearly.

- A harness record lists the pages it was checked against in `sources`, as links to reference
  records.
- `archive` and `url_status` are optional. Leave them out until someone checks.
- `capture` (see the [README](../README.md)) adds a record when it is given a URL that has none.
