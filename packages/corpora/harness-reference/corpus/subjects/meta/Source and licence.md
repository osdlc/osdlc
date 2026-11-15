---
slug: meta/source-license
category: meta
description: Whether the harness source is open, and under which licence.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    governance:
      description: Who accepts changes to the source.
      type: string
    license:
      description: The SPDX license id.
      type: string
    open_source:
      description: Whether the source is published under an open-source license.
      type: boolean
  additionalProperties: true
---
