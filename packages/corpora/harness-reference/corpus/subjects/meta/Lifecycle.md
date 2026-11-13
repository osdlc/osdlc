---
slug: meta/lifecycle
category: meta
description: General availability, preview status, sunset, or a named successor.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    carries_forward:
      description: What carries over from the predecessor.
      type: string
    note:
      description: A caveat about availability or breaking changes.
      type: string
    replaces:
      description: The slug of the harness it replaces.
      type: string
    since_date:
      description: When the status began, as YYYY-MM.
      type: string
    status:
      description: "The lifecycle status: current, developer preview or sunsetting."
      type: string
    successor:
      description: The slug of the harness that replaces it.
      type: string
  additionalProperties: true
---
