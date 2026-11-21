---
slug: inventory/command
category: inventory
description: Which command lists what the store holds, or how much space it uses?
valueSchema:
  type: object
  additionalProperties: false
  required: [supported]
  properties:
    supported: { type: boolean }
    commands:
      type: array
      items:
        type: object
        additionalProperties: false
        required: [command, shows]
        properties:
          command: { type: string, minLength: 1 }
          shows: { type: string, minLength: 1 }
---

A cleaner uses these to show what a candidate holds, such as each model and its size, before a
person picks.
