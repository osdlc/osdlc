---
slug: skills/agent-loading
category: skills
description: "How the model loads a skill body, and when: at startup, when the task matches, or only on invocation."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    after_load:
      description: What happens to the body after it loads.
      type: string
    base_dir:
      description: Whether the skill folder is told to the model.
      type: string
    body_at_startup:
      description: Whether the body is in context at startup.
      type: boolean
    body_loaded:
      description: When the body loads.
      type: string
    body_on:
      description: The event that loads the body.
      type: string
    built_ins_via_skill_tool:
      description: Built-in commands that run through the skill tool.
      type: string
    decision:
      description: Who decides to load a skill.
      type: string
    example:
      description: An example call that loads a skill.
      type: string
    explicit:
      description: How the user loads one explicitly.
      type: string
    loaded_when_relevant:
      description: When it loads.
      type: string
    loads:
      description: When and how it loads.
      type: string
    manual_invocation:
      description: How the user attaches a skill by hand.
      type: string
    mechanism:
      description: The tool or action that loads the body.
      type: string
    progressive:
      description: Whether loading is progressive.
      type: boolean
    resources_on_demand:
      description: Whether resources load only on demand.
      type: boolean
    trigger:
      description: What triggers loading.
      type: string
    user_activation:
      description: How the user activates a skill.
      type: string
  additionalProperties: true
---
