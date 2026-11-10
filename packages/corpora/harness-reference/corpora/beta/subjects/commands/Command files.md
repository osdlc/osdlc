---
slug: commands/files
category: commands
description: Whether custom commands are defined as files, and what replaced them.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    note:
      description: What replaced command files, or how they changed.
      type: string
    supported:
      description: Whether custom commands are defined as files. "partial" where they only partly are.
      type:
        - boolean
        - string
  additionalProperties: true
---
