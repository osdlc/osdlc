---
slug: skills/name-validation
category: skills
description: What the harness checks about a skill name, and whether a failure blocks loading.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    blocking:
      description: Whether a failed check blocks loading.
      type: boolean
    charset:
      description: The characters allowed.
      type: string
    checks:
      description: What the harness checks.
      type: string
    colon_allowed:
      description: Whether a colon is allowed.
      type: boolean
    consecutive_hyphens:
      description: Whether consecutive hyphens are allowed.
      type: boolean
    edges:
      description: What is not allowed at the ends.
      type: string
    length:
      description: The allowed length.
      type: string
    must_match_directory:
      description: Whether the name must equal the directory name.
      type: boolean
    rejects_only:
      description: The only thing the harness rejects.
      type: string
  additionalProperties: true
---
