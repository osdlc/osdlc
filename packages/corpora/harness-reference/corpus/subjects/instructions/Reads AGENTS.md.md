---
slug: instructions/agents-md
category: instructions
description: Whether AGENTS.md is read natively, without an import line.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    role:
      description: Whether AGENTS.md is the primary instruction file or a fallback.
      type: string
    supported:
      description: Whether AGENTS.md is read natively.
      type: boolean
    workaround:
      description: How to get its content in when it is not read natively.
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
