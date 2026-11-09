---
slug: cli/open-with-id
category: cli
description: Whether a new session can be opened under a caller-chosen id or name.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    flags:
      type: string
    note:
      type: string
    supported:
      description: Whether the harness can do it at all.
      type: boolean
  additionalProperties: true
---
