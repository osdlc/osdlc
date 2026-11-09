---
slug: cli/fork
category: cli
description: Whether a saved session can be cloned into a new one.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    command:
      type: string
    flags:
      type: string
    note:
      type: string
    supported:
      description: Whether the harness can do it at all.
      type: boolean
  additionalProperties: true
---
