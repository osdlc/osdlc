---
slug: permissions/tool-rules
category: permissions
description: How does a caller allow or deny specific tools for a run?
valueSchema:
  description: Tool allow and deny rules.
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
    allow_argv:
      description: The arguments that allow tools, with {rules} for the list.
      type: array
      items:
        type: string
    deny_argv:
      description: The arguments that deny tools, with {rules} for the list.
      type: array
      items:
        type: string
    ask_argv:
      description: The arguments that force a prompt for tools.
      type: array
      items:
        type: string
    config_key:
      description: The config key that holds the rules.
      type: string
    syntax:
      description: The rule syntax, such as Tool(pattern).
      type: string
    precedence:
      description: Which rule wins when they conflict.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

Beyond a mode, a caller may allow or deny individual tools or commands. This subject records the flags or settings that carry allow, deny and ask rules, the rule syntax and the precedence among them.
