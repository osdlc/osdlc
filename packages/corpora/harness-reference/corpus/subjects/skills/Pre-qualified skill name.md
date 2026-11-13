---
slug: skills/prequalified-name
category: skills
description: What happens when a plugin skill's frontmatter `name` already carries the `<plugin>:` prefix.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    behaviour:
      description: What happens to the doubled prefix.
      type: string
    example:
      description: An example of the resulting name.
      type: string
  additionalProperties: true
---
