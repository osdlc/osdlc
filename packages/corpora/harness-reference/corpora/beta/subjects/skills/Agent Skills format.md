---
slug: skills/agent-skills-format
category: skills
description: Whether the harness reads the agentskills.io SKILL.md folder format.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    layout:
      description: The folder layout the harness expects.
      type: string
    supported:
      description: Whether the harness reads the SKILL.md folder format.
      type: boolean
  additionalProperties: true
---
