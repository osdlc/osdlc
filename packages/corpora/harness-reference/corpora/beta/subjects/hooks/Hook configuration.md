---
slug: hooks/config
category: hooks
description: Where hooks are configured and whether they are shell commands or code plugins.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    also_reads:
      description: Other harnesses hook configs this one also reads.
      type: string
    config:
      description: The shape of one hook entry.
      type: string
    documented:
      description: Whether the harness documents the behaviour.
      type: boolean
    enabled_by_default:
      description: Whether hooks run without being switched on.
      type: boolean
    events:
      description: The event vocabulary the hooks follow.
      type: string
    kind:
      description: "What a hook is: a shell command, a code plugin or a bridge."
      type: string
    location:
      description: Where hooks are configured.
      type: string
    shell_hooks:
      description: Whether a hook can be a shell command.
      type: boolean
    supported:
      description: Whether the harness supports hooks.
      type: boolean
  additionalProperties: true
---
