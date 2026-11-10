---
slug: hooks/events
category: hooks
description: The lifecycle events a hook can attach to.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    count:
      description: How many events, as the source states it.
      type: string
    events:
      description: The lifecycle events a hook can attach to.
      type: array
      items:
        type: string
    via:
      description: The bridge through which the events arrive.
      type: string
  additionalProperties: true
---
