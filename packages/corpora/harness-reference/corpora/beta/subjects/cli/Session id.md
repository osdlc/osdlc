---
slug: cli/session-id
category: cli
description: How does a caller choose, find or read the id of a session?
valueSchema:
  description: How a session id is chosen and read.
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
    assign_argv:
      description: The arguments that assign an id, with {id} for it.
      type: array
      items:
        type: string
    format:
      description: The id format, such as uuid.
      type: string
    reported_in:
      description: "Where the id appears: result, event, file or env."
      type: array
      items:
        type: string
    result_field:
      description: The field in the result that holds the id.
      type: string
    env_var:
      description: An environment variable that carries it inside the session.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

A caller that wants to resume or track a run needs the session id. This subject records whether the caller can assign an id up front, where an id is reported (a result field, a header event or a file) and the form it takes. Opening with a chosen id is a separate subject.
