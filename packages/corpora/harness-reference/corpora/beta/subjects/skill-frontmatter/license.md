---
slug: skill-frontmatter/license
category: skill-frontmatter
description: The `license` field.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    form:
      description: What the value may be.
      type: string
    required:
      description: Whether the field is required.
      type: boolean
    supported:
      description: Whether the harness honours the field.
      type: boolean
  additionalProperties: true
---
