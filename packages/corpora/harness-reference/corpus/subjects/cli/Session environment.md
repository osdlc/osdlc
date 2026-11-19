---
slug: cli/session-env
category: cli
description: Environment variables the harness exports to the commands it runs.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    vars:
      type: array
      items:
        type: string
  additionalProperties: true
---
