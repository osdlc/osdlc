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
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
