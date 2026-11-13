---
slug: config/main-file
category: config
description: The harness's main settings file and its format.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    file:
      description: The harness main settings file.
      type: string
    format:
      description: The file format, such as JSON, TOML or YAML.
      type: string
    merge:
      description: How layers of config combine.
      type: string
    note:
      description: A caveat or detail that the other keys do not carry.
      type: string
    published_schema:
      description: Whether a JSON Schema for the file is published.
      type: boolean
    scope:
      description: Whether the file is global only or also per project.
      type: string
  additionalProperties: true
---
