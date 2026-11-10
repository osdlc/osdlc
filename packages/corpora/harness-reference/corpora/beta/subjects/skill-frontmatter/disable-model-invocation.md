---
slug: skill-frontmatter/disable-model-invocation
category: skill-frontmatter
description: The field that stops the model from invoking a skill on its own.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    effect:
      description: What setting it does.
      type: string
    supported:
      description: Whether the harness honours the field.
      type: boolean
  additionalProperties: true
---
