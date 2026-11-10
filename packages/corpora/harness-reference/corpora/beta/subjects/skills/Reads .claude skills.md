---
slug: skills/claude-dir
category: skills
description: Whether Claude Code's `.claude/skills/` directory is read.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    role:
      description: How the directory is treated, such as native.
      type: string
    supported:
      description: Whether .claude/skills is read.
      type: boolean
  additionalProperties: true
---
