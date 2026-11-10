---
slug: cli/continue
category: cli
description: Is there a flag that continues the most recent session without naming an id?
valueSchema:
  description: How the most recent session is continued.
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
    argv:
      description: The arguments that continue the latest session.
      type: array
      items:
        type: string
    chosen_by:
      description: How the latest session is picked, such as most recent in the working directory.
      type: string
    accepts_prompt:
      description: Whether a new prompt can be given with it.
      type: boolean
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

Distinct from resuming a named session, many harnesses can pick up the latest session in the working directory with one flag. This subject records that flag, how the latest session is chosen and whether a new prompt can be passed with it.
