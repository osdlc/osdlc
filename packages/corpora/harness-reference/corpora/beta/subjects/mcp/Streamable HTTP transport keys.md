---
slug: mcp/streamable-http
category: mcp
description: The keys that declare a streamable HTTP MCP server.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    address_key:
      description: The key that holds the server URL.
      type: string
    also:
      description: Other keys the entry takes.
      type: string
    recommended:
      description: Whether it is the recommended remote transport.
      type: boolean
    supported:
      description: Whether streamable HTTP servers are supported.
      type: boolean
    transport:
      description: The transport name the harness uses.
      type: string
    type:
      description: The `type` value that selects it.
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
