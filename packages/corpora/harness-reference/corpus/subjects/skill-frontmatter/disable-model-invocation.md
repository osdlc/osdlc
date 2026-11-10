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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
