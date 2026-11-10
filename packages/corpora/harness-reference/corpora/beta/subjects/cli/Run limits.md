---
slug: cli/limits
category: cli
description: "What limits can a caller put on a run: turns, budget or time?"
valueSchema:
  description: The limits a run can carry.
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
    max_turns:
      description: The cap on agent turns.
      type: object
      properties:
        argv:
          description: Arguments to set it, with {n} for the number.
          type: array
          items:
            type: string
        config_key:
          description: A config key that sets it.
          type: string
      additionalProperties: true
    max_budget:
      description: The cap on spend.
      type: object
      properties:
        argv:
          description: Arguments to set it, with {usd} for the amount.
          type: array
          items:
            type: string
        config_key:
          description: A config key that sets it.
          type: string
      additionalProperties: true
    timeout:
      description: The cap on wall time.
      type: object
      properties:
        argv:
          description: Arguments to set it, with {seconds} for the time.
          type: array
          items:
            type: string
        config_key:
          description: A config key that sets it.
          type: string
      additionalProperties: true
    on_limit:
      description: What happens when a limit is reached, such as exit code or error result.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A caller running an agent unattended wants a ceiling on turns, spend and wall time. This subject records each limit the harness offers, as the flag that sets it and what happens when it is hit.
