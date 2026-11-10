---
slug: plugins/session-load
category: plugins
description: Can a plugin be loaded for one session without installing it?
valueSchema:
  description: Loading plugins for one session.
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
    load_argv:
      description: The arguments that load one directory, with {dir} for it.
      type: array
      items:
        type: string
    repeatable:
      description: Whether the flag may be repeated.
      type: boolean
    disable_argv:
      description: The arguments that switch an installed plugin off, with {id} for it.
      type: array
      items:
        type: string
    disable_via:
      description: Where disabling is expressed, such as a settings override.
      type: string
    persists:
      description: Whether the load survives the session.
      type: boolean
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A caller may want to try a plugin directory for a single run, leaving the user's installed set alone, and sometimes to switch an installed plugin off for that run. This subject records the flag that loads a directory and the way an installed plugin is disabled.
