---
slug: permissions/modes
category: permissions
description: What permission modes exist, and how does a caller select each?
valueSchema:
  description: The permission modes.
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
    modes:
      description: The modes, each mapped to an intent and how to select it.
      type: array
      items:
        description: One mode.
        type: object
        properties:
          name:
            description: The mode name as the harness spells it.
            type: string
          intent:
            description: The closest generic intent.
            enum:
              - read-only
              - edits
              - full-auto
              - bypass
          argv:
            description: The arguments that select it.
            type: array
            items:
              type: string
          env:
            description: Environment variables that select it.
            type: object
            additionalProperties:
              type: string
          config_key:
            description: The config setting that selects it.
            type: string
          notes:
            description: Caveats, such as how close the match is.
            type: string
        required:
          - name
          - intent
        additionalProperties: true
    default:
      description: The mode used when none is chosen.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A harness gates tool use behind a permission mode. A caller needs to pick the mode that matches an intent: read only, edits allowed, full automation or bypass of every check. This subject records each mode the harness has, the intent it serves, and the argv or environment that selects it.
