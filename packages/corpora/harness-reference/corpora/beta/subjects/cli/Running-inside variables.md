---
slug: cli/current-env
category: cli
description: Which environment variables mark a process as running inside the harness?
valueSchema:
  description: Variables that mark a process as inside the harness.
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
    vars:
      description: Marker variables, each with the value it takes when set.
      type: array
      items:
        description: One marker variable.
        type: object
        properties:
          name:
            description: The variable name.
            type: string
          value:
            description: The value it holds, or "any" when only its presence counts.
            type: string
          meaning:
            description: What it tells the process.
            type: string
        required:
          - name
        additionalProperties: true
    reliable:
      description: Whether the harness documents them as stable.
      type: boolean
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A program started by the harness can tell it is being run by an agent from variables the harness sets in the child environment. This subject records those marker variables and what each means. It is distinct from the session environment subject, which records the variables that carry session data.
