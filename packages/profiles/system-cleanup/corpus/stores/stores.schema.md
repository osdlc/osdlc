---
$schema: https://json-schema.org/draft/2020-12/schema
title: Store
description: >-
  One tool or app that keeps data a cleaner could reclaim, stores/<name>.md. The id is the file
  name: the product's name as the vendor writes it.
type: object
additionalProperties: false
required: [slug, category, vendor, homepage, open_source, platforms, checked, sources]
properties:
  slug:
    description: >-
      A stable key: lowercase letters, digits and hyphens. A workstation-cleaner plugin keys on it, so a
      rename of the record does not change it.
    type: string
    pattern: "^[a-z0-9][a-z0-9-]*$"
  category:
    description: What kind of thing it is, which decides which workstation-cleaner plugin family covers it.
    enum:
      - language-package-manager
      - os-package-manager
      - toolchain-manager
      - build-tool
      - sdk
      - model-runtime
      - model-hub
      - container-runtime
      - editor
      - app
  vendor:
    description: The company, organization or project that makes it.
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
  platforms:
    description: The operating systems it runs on.
    type: array
    minItems: 1
    items: { enum: [macos, linux, windows] }
  cli:
    description: The command a user types to run it; omitted when it has none.
    type: string
    minLength: 1
  system:
    description: >-
      True when its data is system-wide and cleaning it needs root or an administrator, such as an
      OS package manager's cache. Omitted means it lives in the user's home folder.
    type: boolean
  checked:
    description: The date this record was last checked against its sources.
    type: string
    format: date
  sources:
    description: Links to the document records for the pages every value above comes from.
    type: array
    minItems: 1
    items: { type: string, x-ref: documents }
allOf:
  - if:
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

# Stores

One record per tool or app that fills a disk: a package manager, a toolchain manager, a build
tool, a model runtime, an editor. The file name is the product's name as the vendor writes it,
such as `pnpm.md` or `LM Studio.md`. Its body is two or three plain sentences on what it is and
what it fills disks with.

This file's frontmatter is the schema and the only list of the fields. The rules a description
does not say:

- `slug` is the store's key outside the corpus. It is unique and never changes once a plugin uses
  it.
- `category` groups stores into workstation-cleaner plugin families. A tool that is two things, such as a
  language's toolchain and its package manager, takes the one its disk use comes from.
- `sources` lists links to document records, one per page used for the fields above.
- `license` is allowed only when `open_source` is true.
- A record carries no `type` field. Its type comes from its folder.
