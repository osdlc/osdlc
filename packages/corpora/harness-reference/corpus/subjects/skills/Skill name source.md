---
slug: skills/name-source
category: skills
description: Where the skill's runtime name comes from (frontmatter `name`, directory, or both).
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    required_fields:
      description: The frontmatter fields that are required.
      type: array
      items:
        type: string
    root_skill_needs_name:
      description: Whether a skill at the root needs a name.
      type: boolean
    rule:
      description: Where the runtime name comes from.
      type: string
  additionalProperties: true
---
