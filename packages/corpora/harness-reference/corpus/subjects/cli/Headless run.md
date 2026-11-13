---
slug: cli/headless
category: cli
description: The flag or subcommand for a one-shot, non-interactive run.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    command:
      type: string
    flag:
      type: string
    fork:
      type: string
    note:
      type: string
    one_task_per_run:
      type: boolean
    resume:
      type: string
    stdin:
      type: string
    argv:
      description: The full argument list, one element per argument, with placeholders such as {prompt} or {id}.
      type: array
      items:
        type: string
  additionalProperties: true
---
