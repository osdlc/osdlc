---
slug: clean/command
category: clean
description: Does the store have its own command to reclaim space, and what does each one remove?
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
        required: [command, removes]
        properties:
          command: { type: string, minLength: 1 }
          removes: { type: string, minLength: 1 }
---

A store's own command knows its layout and locks, so a cleaner prefers it to deleting files.
`removes` says what each command takes, in the tool's words where it has them.
