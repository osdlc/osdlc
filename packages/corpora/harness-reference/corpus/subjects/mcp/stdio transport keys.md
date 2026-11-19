---
slug: mcp/stdio
category: mcp
description: The keys that declare a stdio MCP server.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    address_key:
      description: The key that holds the command.
      type: string
    also:
      description: Other keys the entry takes.
      type: string
    command_form:
      description: The form of the command, such as an array.
      type: string
    supported:
      description: Whether stdio servers are supported.
      type: boolean
    transport:
      description: The transport name the harness uses.
      type: string
    type:
      description: The `type` value that selects it.
      type: string
    type_alias:
      description: An alternate `type` value that means the same.
      type: string
    type_optional:
      description: Whether `type` may be left out.
      type: boolean
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
