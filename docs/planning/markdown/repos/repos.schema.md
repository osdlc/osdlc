---
$schema: https://json-schema.org/draft/2020-12/schema
title: Repo
description: >-
  A repository that holds components. The record's id is the owner and name joined by a hyphen,
  such as osdlc-markdown.
type: object
additionalProperties: false
x-id-pattern: "^[a-z0-9-]+$"
required: [full_name, label, url]
properties:
  full_name:
    description: The owner and name, such as osdlc/markdown.
    type: string
    pattern: "^[^/]+/[^/]+$"
  label:
    description: A short name people see, such as markdown.
    type: string
    minLength: 1
  url:
    type: string
    format: uri
---

# Repos

One record per repository that holds a component today or in the target.
