---
slug: cli/structured-output
category: cli
description: Machine-readable output formats for headless runs.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    caps:
      type: string
    input:
      type: string
    last_message:
      type: string
    output:
      type: string
    partial:
      type: string
    rpc:
      type: string
    schema:
      type: string
    schema_version:
      type: string
  additionalProperties: true
---
