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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
