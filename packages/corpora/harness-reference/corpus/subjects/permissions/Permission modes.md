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
              - plan
              - sandbox
              - deny-unapproved
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
          aliases:
            description: Other names the harness accepts for the same mode.
            type: array
            items: &a1
              type: string
          approval:
            description: The approval-policy value that goes with the mode, where approvals are the
              separate `approval_policy` axis.
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
    default_by_surface:
      description: The default mode on each surface, when it differs.
      type: object
      properties:
        interactive:
          type: string
        headless:
          type: string
      additionalProperties: true
    approval_policy:
      description: A separate approval-policy axis, where the harness has one besides modes.
      type: object
      properties:
        argv:
          description: Arguments that select a policy, with {policy} for it.
          type: array
          items: *a1
        config_key:
          type: string
        values:
          description: The policies accepted.
          type: array
          items: *a1
        default:
          type: string
      additionalProperties: true
    rules:
      description: Per-action allow, ask and deny settings, for a harness with no named modes.
      type: object
      properties:
        config_key:
          description: The config key that holds the rules.
          type: string
        actions:
          description: The actions that can be ruled on, such as bash or edit.
          type: array
          items: *a1
        values:
          description: The decisions accepted, such as allow, ask and deny.
          type: array
          items: *a1
        default:
          type: string
      additionalProperties: true
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---

A harness gates tool use behind a permission mode. A caller needs to pick the mode that matches an intent: read only, edits allowed, full automation or bypass of every check. This subject records each mode the harness has, the intent it serves, and the argv or environment that selects it.
