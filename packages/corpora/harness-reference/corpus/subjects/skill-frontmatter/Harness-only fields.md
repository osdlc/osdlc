---
slug: skill-frontmatter/extensions
category: skill-frontmatter
description: Frontmatter fields one harness adds beyond the spec.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    fields:
      description: Frontmatter fields the harness adds beyond the spec.
      type: array
      items:
        type: string
  additionalProperties: true
---
