---
slug: mcp/strict-config
category: mcp
description: Can a run use only the MCP servers it is given, ignoring the user's own?
valueSchema:
  description: Passing MCP config for one run.
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
    config_argv:
      description: The arguments that pass a config file, with {file} for the path.
      type: array
      items:
        type: string
    strict_argv:
      description: The arguments that make it the only source.
      type: array
      items:
        type: string
    ignores:
      description: What strict mode ignores, such as user and project servers.
      type: array
      items:
        type: string
    inline_json:
      description: Whether the config may be passed as inline JSON.
      type: boolean
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A caller that passes an MCP config for one run often wants no other server to load. This subject records the flag for passing a config file, whether a strict option makes it the only source and what is ignored when it is on.
