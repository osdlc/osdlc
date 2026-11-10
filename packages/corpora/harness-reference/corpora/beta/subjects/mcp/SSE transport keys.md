---
slug: mcp/sse
category: mcp
description: The keys that declare a server-sent-events MCP server.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    address_key:
      description: The key that holds the server URL.
      type: string
    deprecated:
      description: Whether the transport is deprecated.
      type: boolean
    documented:
      description: Whether the transport is documented.
      type: boolean
    legacy:
      description: Whether it is kept only for older servers.
      type: boolean
    note:
      description: How the transport is detected or reached.
      type: string
    supported:
      description: Whether SSE servers are supported.
      type: boolean
    type:
      description: The `type` value that selects it.
      type: string
  additionalProperties: true
---
