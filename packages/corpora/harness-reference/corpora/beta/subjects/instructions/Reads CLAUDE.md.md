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
  additionalProperties: true
---
