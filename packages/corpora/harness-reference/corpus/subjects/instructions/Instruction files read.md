---
slug: instructions/files
category: instructions
description: Every always-loaded instruction file the harness reads, project and user level.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    budget:
      description: How much instruction text is read.
      type: string
    files:
      description: The instruction files read, project and user level.
      type: array
      items:
        type: string
    not_read:
      description: A file that looks relevant but is not read.
      type: string
    note:
      description: A caveat about the files read.
      type: string
    walk:
      description: The directories searched for them.
      type: string
  additionalProperties: true
---
