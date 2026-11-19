---
slug: meta/version-seen
category: meta
description: A harness version a source names, with the date and context (latest release, or the build installed when checked).
cardinality: latest
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  required: [version, observed]
  properties:
    context:
      description: What the version was when seen, such as latest release or installed build.
      type: string
    observed:
      description: The date the version was seen, YYYY-MM-DD.
      type: string
      pattern: '^\d{4}-\d{2}-\d{2}$'
    version:
      description: The version string, as the harness spells it.
      type: string
  additionalProperties: true
---
