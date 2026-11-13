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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
