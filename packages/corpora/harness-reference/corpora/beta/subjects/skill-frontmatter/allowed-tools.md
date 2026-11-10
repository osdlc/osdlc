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
  additionalProperties: true
---
