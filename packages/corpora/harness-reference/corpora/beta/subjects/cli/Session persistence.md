---
slug: cli/session-persistence
category: cli
description: Does a run save a session, and can that be turned off?
valueSchema:
  description: Whether sessions are saved.
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
    persists_by_default:
      description: Whether a run is saved without being asked.
      type: boolean
    disable_argv:
      description: The arguments that turn saving off.
      type: array
      items:
        type: string
    disable_env:
      description: Environment variables that turn saving off.
      type: object
      additionalProperties:
        type: string
    config_key:
      description: The config key that controls it.
      type: string
    store:
      description: Where sessions are kept, starting with ~/ or the project root.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A headless run may write its transcript to disk so it can be resumed, which is unwanted for a one-shot or a private run. This subject records whether runs persist by default, the flag or setting that turns persistence off and where saved sessions live.
