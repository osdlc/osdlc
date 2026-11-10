---
slug: instructions/claude-md
category: instructions
description: Whether CLAUDE.md is read, natively or as a fallback.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    role:
      description: Whether CLAUDE.md is the primary file or a fallback.
      type: string
    scope:
      description: Where the file is read, such as only in one interface.
      type: string
    supported:
      description: Whether CLAUDE.md is read.
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
