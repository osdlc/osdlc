---
slug: mcp/config-file
category: mcp
description: The file and key that hold MCP server definitions, and its format.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    file:
      description: The file that holds MCP server definitions.
      type: string
    format:
      description: The file format.
      type: string
    key:
      description: The key under which servers are listed.
      type: string
    note:
      description: A caveat about MCP support.
      type: string
    reads_mcp_servers_json:
      description: Whether it also reads a mcpServers JSON file from another harness.
      type: boolean
    supported:
      description: Whether the harness supports MCP.
      type: boolean
    tool_names:
      description: How MCP tools are named to the model.
      type: string
    url_key:
      description: The key that holds a server URL.
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
