---
slug: skill-frontmatter/allowed-tools
category: skill-frontmatter
description: The `allowed-tools` field that lists tools a skill pre-approves to run.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    experimental:
      description: Whether the field is marked experimental.
      type: boolean
    form:
      description: The form of the value.
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
