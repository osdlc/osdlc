---
slug: skills/agents-dir
category: skills
description: Whether the neutral `.agents/skills/` directory (project or user) is read.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    supported:
      description: Whether .agents/skills is read.
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
