---
slug: skill-frontmatter/metadata
category: skill-frontmatter
description: The `metadata` map for keys the spec does not define.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    required:
      description: Whether the field is required.
      type: boolean
    supported:
      description: Whether the harness honours the field.
      type: boolean
    type:
      description: The type of the map.
      type: string
  additionalProperties: true
---
