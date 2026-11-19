---
slug: cli/headless-slash-command
category: cli
description: >-
  How is a slash command or skill call in a headless (one-shot) prompt parsed: where must the call
  sit, and which text becomes its arguments?
model_dependent: true
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    supported:
      description: Whether a headless prompt can call a slash command or skill.
      type: boolean
    position:
      description: Where in the prompt the call must sit to be parsed as a command.
      type: string
    arguments:
      description: Which text becomes the command's arguments.
      type: string
    later_text:
      description: What happens to prompt text after the call.
      type: string
    not_at_start:
      description: What happens to a call that is not where the harness parses it.
      type: string
  additionalProperties: true
---

When the harness does not parse a call, the model may still run the command itself. That part
depends on the model, so a statement about it names the `model` in its scope.
