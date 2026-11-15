---
slug: instructions/system-prompt-flag
category: instructions
description: Which flags set or extend the system prompt for a run?
valueSchema:
  description: Flags for the system prompt.
  type: object
  properties:
    supported:
      description: 'Whether the harness supports it: true, false, or "partial" where only part works.'
      type:
        - boolean
        - string
      enum:
        - true
        - false
        - partial
    replace_argv:
      description: The arguments that replace the prompt, with {text} for the string.
      type: array
      items:
        type: string
    replace_file_argv:
      description: The arguments that replace it from a file, with {file} for the path.
      type: array
      items:
        type: string
    append_argv:
      description: The arguments that append, with {text} for the string.
      type: array
      items:
        type: string
    append_file_argv:
      description: The arguments that append from a file, with {file} for the path.
      type: array
      items:
        type: string
    env:
      description: Environment variables that set it.
      type: object
      additionalProperties:
        type: string
    replace_drops_defaults:
      description: Whether replacing removes the harness defaults.
      type: boolean
    note:
      description: A caveat the other keys do not carry.
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

A caller may replace the system prompt or append to it, from a string or a file. This subject records each flag, which of those it does, and whether replacing drops the harness defaults.
