---
slug: cli/effort
category: cli
description: How does a caller set the reasoning effort for a run?
valueSchema:
  description: How effort is set.
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
      description: The arguments to set a level, with {level} for the value, such as ["--effort","{level}"].
      type: array
      items:
        type: string
    env:
      description: Environment variables that set it.
      type: object
      additionalProperties:
        type: string
    config_key:
      description: The config key that sets it.
      type: string
    levels:
      description: The accepted levels, lowest first.
      type: array
      items:
        type: string
    below_low:
      description: What a caller should do for a level below the lowest accepted.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
    levels_by_model:
      description: The accepted levels per model, lowest first, keyed by model name or pattern.
      type: object
      additionalProperties:
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

Some harnesses take a reasoning-effort level as a flag, a config value or an environment variable. This subject records how it is set, the levels accepted and what happens to a level the harness does not have. The model flag is a separate subject.
