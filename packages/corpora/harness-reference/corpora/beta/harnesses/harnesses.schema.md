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
    description: The pages every value above comes from.
    type: array
    minItems: 1
    items: { $ref: "#/$defs/source" }
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
  source:
    description: >-
      A page that backs one or more field values: a vendor site, docs, repository or release list.
    type: object
    additionalProperties: false
    required: [url, title]
    properties:
      url: { $ref: "#/$defs/https-url" }
      title: { type: string, minLength: 1 }
---

# Harnesses

One record per harness. The file name is the product's name as the vendor writes it, such as
`Claude Code.md` or `goose.md`. The frontmatter holds the fields below. The body is two to four
plain sentences on what it is, who makes it, and anything notable.

| Field         | Required | Holds                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------- |
| `vendor`      | yes      | The company or organization that makes it                               |
| `homepage`    | yes      | The product's main page                                                 |
| `docs`        | yes      | The start of its user documentation                                     |
| `repository`  | no       | The public source repository; omitted when the source is not public     |
| `license`     | no       | SPDX license id; only set when `open_source` is true                    |
| `open_source` | yes      | Whether its source is published under an open-source license            |
| `cli`         | no       | The command a user types to start it; omitted when it has no CLI        |
| `surfaces`    | yes      | One or more of `cli`, `ide`, `desktop`, `web`                           |
| `status`      | yes      | `current`, `sunsetting` or `retired`                                    |
| `successor`   | no       | A link to the harness the vendor names as its replacement               |
| `fork_of`     | no       | A link to the harness it was forked from                                |
| `versioning`  | yes      | `semver`, `date` or `unknown`, as its releases show                     |
| `checked`     | yes      | The date the record was last checked against its sources (`YYYY-MM-DD`) |
| `sources`     | yes      | `{ url, title }` pages that back every value above; at least one        |

- `successor` and `fork_of` are relative links to another harness, written as a quoted string:
  `successor: "[Antigravity](Antigravity.md)"`. `x-ref: harnesses` makes the validator check that
  the link points at a harness record.
- `license` is allowed only when `open_source` is true.
- A record carries no `type` field. Its type comes from its folder.
