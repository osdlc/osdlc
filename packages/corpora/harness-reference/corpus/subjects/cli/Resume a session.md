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
    argv:
      description: The full argument list, one element per argument, with placeholders such as {prompt} or {id}.
      type: array
      items:
        type: string
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
