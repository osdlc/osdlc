---
slug: skills/user-invocation
category: skills
description: What a user types to run a skill.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    also:
      description: Another way to run a skill.
      type: string
    effect:
      description: What invocation does.
      type: string
    note:
      description: A caveat about invocation.
      type: string
    syntax:
      description: What the user types.
      type: string
  additionalProperties: true
---
