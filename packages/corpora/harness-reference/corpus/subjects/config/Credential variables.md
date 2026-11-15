---
slug: config/credentials-env
category: config
description: Which environment variables supply credentials, and which are read?
valueSchema:
  description: Credential variables.
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
      description: The credential variables.
      type: array
      items:
        description: One variable.
        type: object
        properties:
          name:
            description: The variable name.
            type: string
          kind:
            description: What it carries.
            enum:
              - api-key
              - oauth-token
              - base-url
              - other
          provider:
            description: The provider it is for.
            type: string
          precedence:
            description: How it ranks against stored login.
            type: string
        required:
          - name
        additionalProperties: true
    login_command:
      description: The command that stores a login.
      type: string
    note:
      description: A caveat the other keys do not carry.
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

A caller running a harness unattended passes credentials through the environment. This subject records the variables that carry an API key or token, which provider each is for, and which one wins over stored login.
