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
    obtained_by:
      description: "How a caller learns the id when it cannot assign one: a flag, a command or an event."
      enum:
        - flag
        - command
        - event
    command:
      description: The command that creates or returns an id, when obtained_by is command.
      type: array
      items:
        type: string
    creates_on_missing:
      description: Whether naming an id that does not exist creates a session with it.
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

A caller that wants to resume or track a run needs the session id. This subject records whether the caller can assign an id up front, where an id is reported (a result field, a header event or a file) and the form it takes. Opening with a chosen id is a separate subject.
