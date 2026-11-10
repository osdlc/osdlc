---
slug: skills/agents-dir
category: skills
description: Whether the neutral `.agents/skills/` directory (project or user) is read.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    supported:
      description: Whether .agents/skills is read.
      type: boolean
  additionalProperties: true
---
