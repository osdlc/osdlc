---
slug: skill-frontmatter/compatibility
category: skill-frontmatter
description: The `compatibility` field and its limit.
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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
