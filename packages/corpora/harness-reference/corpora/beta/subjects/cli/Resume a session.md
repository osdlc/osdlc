---
slug: cli/resume
category: cli
description: How a saved session is resumed, and whether a new prompt can be passed.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    by:
      type: string
    command:
      type: string
    flags:
      type: string
    from_pr:
      type: string
    latest:
      type: string
    picker:
      type: string
    refused_when:
      type: string
    supported:
      description: Whether the harness can do it at all.
      type: boolean
  additionalProperties: true
---
