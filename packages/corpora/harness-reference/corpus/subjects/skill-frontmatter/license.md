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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
