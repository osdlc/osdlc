---
$schema: https://json-schema.org/draft/2020-12/schema
title: Harness
description: >-
  The data of one harness, harnesses/<name>.md. The id is the file name: the product's name as the
  vendor writes it.
type: object
additionalProperties: false
required: [vendor, homepage, docs, open_source, surfaces, status, versioning, checked, sources]
properties:
  vendor:
    description: The company or organization that makes it.
    type: string
    minLength: 1
  homepage:
    description: The product's main page.
    $ref: "#/$defs/https-url"
  docs:
    description: The start of its user documentation.
    $ref: "#/$defs/https-url"
  repository:
    description: The public source repository; omitted when the source is not public.
    $ref: "#/$defs/https-url"
  license:
    description: SPDX license id; omitted when it is not open source.
    type: string
    minLength: 1
  open_source:
    description: Whether its source is published under an open-source license.
    type: boolean
  cli:
    description: The command a user types to start it; omitted when it has no CLI.
    type: string
    minLength: 1
  surfaces:
    description: "Where it runs: terminal, editor, desktop app or browser."
    type: array
    minItems: 1
    items: { enum: [cli, ide, desktop, web] }
  status:
    description: Whether the vendor still develops it.
    enum: [current, sunsetting, retired]
  successor:
    description: A link to the harness the vendor names as its replacement.
    type: string
    x-ref: harnesses
  fork_of:
    description: A link to the harness it was forked from.
    type: string
    x-ref: harnesses
  versioning:
    description: How its releases are numbered.
    enum: [semver, date, unknown]
  checked:
    description: The date this record was last checked against its sources.
    type: string
    format: date
  sources:
    description: Links to the reference records for the pages every value above comes from.
    type: array
    minItems: 1
    items: { type: string, x-ref: references }
if:
  properties: { open_source: { const: false } }
  required: [open_source]
then:
  properties: { license: false }
$defs:
  https-url:
    type: string
    format: uri
    pattern: "^https://"
---

# Harnesses

One record per harness. The file name is the product's name as the vendor writes it, such as
`Claude Code.md` or `goose.md`. A record's frontmatter holds its fields. Its body is two to four
plain sentences on what the harness is, who makes it, and anything notable.

This file's frontmatter is the schema and the only list of the fields: each field's `description`
says what it holds. The rules below are the ones a description does not say clearly.

- `successor` and `fork_of` are relative links to another harness, written as a quoted string:
  `successor: "[Antigravity](Antigravity.md)"`. `x-ref: harnesses` makes the validator check that
  the link points at a harness record.
- `sources` lists links to [reference](../references/references.schema.md) records, one per page:
  `"[Claude Code overview](../references/Anthropic/Claude%20Code%20overview.md)"`. Add a reference
  record first when a page has none.
- `license` is allowed only when `open_source` is true.
- A record carries no `type` field. Its type comes from its folder.
