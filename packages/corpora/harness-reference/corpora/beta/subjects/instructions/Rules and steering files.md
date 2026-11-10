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
  additionalProperties: true
---
