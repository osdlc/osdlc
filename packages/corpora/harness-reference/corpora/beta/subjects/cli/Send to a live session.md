---
slug: cli/send-to-live
category: cli
description: Whether a message can be delivered into a session that is already running.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    acp:
      type: string
    command:
      type: string
    headless:
      type: string
    limit:
      type: string
    mechanism:
      type: string
    note:
      type: string
    sdk:
      type: string
    supported:
      description: true, false, or "partial" where only some sessions can be reached.
      enum: [true, false, partial]
  additionalProperties: true
---
