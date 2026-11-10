---
slug: cli/output-format
category: cli
description: Which flag picks the output format of a non-interactive run, and which formats exist?
valueSchema:
  description: The output formats a non-interactive run can print, and the arguments that select each.
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
    formats:
      description: The formats the harness can print, each with the full arguments that select it.
      type: array
      items:
        type: object
        properties:
          name:
            description: The format, such as text, json, stream-json or jsonl.
            type: string
          argv:
            description: >-
              The full arguments to add for this format, such as ["--output-format","stream-json","--verbose"]
              or the standalone switch ["--json"]. Empty when it is the default and needs no argument.
            type: array
            items:
              type: string
        required: [name, argv]
        additionalProperties: true
    note:
      description: A caveat the other keys do not carry.
      type: string
  if:
    properties:
      supported:
        enum:
          - true
          - partial
    required: [supported]
  then:
    required: [formats]
  additionalProperties: true
---

A headless run can print plain text, one JSON document or a stream of JSON events. This subject records the flag that selects the format, the values it takes and the one used for a stream. The shape of the structured result itself belongs to the structured-output subject.
