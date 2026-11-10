---
slug: subagents/definition
category: subagents
description: Where subagent definitions live and in what file format.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    also_reads:
      description: Other agent definitions it also reads.
      type: string
    claude_compatible:
      description: Whether Claude agent files work as they are.
      type: boolean
    documented:
      description: Whether it is documented.
      type: boolean
    file_format:
      description: The file format, or why none exists.
      type: string
    format:
      description: The file format.
      type: string
    location:
      description: Where definitions live.
      type: string
    native:
      description: Whether subagents are built in.
      type: boolean
    note:
      description: A caveat about definitions.
      type: string
  additionalProperties: true
---
