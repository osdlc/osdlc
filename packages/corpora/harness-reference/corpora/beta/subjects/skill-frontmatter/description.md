---
slug: skill-frontmatter/description
category: skill-frontmatter
description: The `description` field, its limits and whether it is required.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    max_length:
      description: Longest allowed value, in characters.
      type: integer
    min_length:
      description: Shortest allowed value, in characters.
      type: integer
    required:
      description: Whether the field is required.
      type: boolean
    supported:
      description: Whether the harness honours the field.
      type: boolean
  additionalProperties: true
---
