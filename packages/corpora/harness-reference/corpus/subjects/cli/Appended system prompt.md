---
slug: cli/append-system-prompt
category: cli
description: >-
  Does text added to the system prompt of a headless run reach the model, and does a slash command
  in the prompt still parse?
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    supported:
      description: Whether a headless run can add system or developer instructions.
      type: boolean
    flag:
      description: The flag that adds them.
      type: string
    keeps_slash_command_parsing:
      description: Whether a slash command at the start of the prompt still parses with the flag set.
      type: boolean
    reaches_model:
      description: Whether the model sees the added text.
      type: boolean
  additionalProperties: true
---

This subject records how the added text behaves in a headless run. The flags that replace or
extend the system prompt are listed under
[System prompt flags](../instructions/System%20prompt%20flags.md).
