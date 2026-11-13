---
slug: instructions/rules
category: instructions
description: Scoped rule files beside the main instruction file, and what decides when they attach.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    attach_by:
      description: What decides when a rule attaches, such as frontmatter keys.
      type: string
    dir:
      description: Where rule files live.
      type: string
    supported:
      description: Whether scoped rule files exist.
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
