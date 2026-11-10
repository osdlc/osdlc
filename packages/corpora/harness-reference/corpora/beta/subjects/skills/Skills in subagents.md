---
slug: skills/subagent-visibility
category: skills
description: Whether a subagent sees and can load the session's skills.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    can_load_skills:
      description: Whether a subagent can load skills.
      type: boolean
    custom_agents_inherit_default_resources:
      description: Whether custom agents inherit default resources.
      type: boolean
    custom_agents_load_skills_by_default:
      description: Whether custom agents load skills by default.
      type: boolean
    disable_with:
      description: How to disable skills for a subagent.
      type: string
    fresh_context:
      description: What a subagent does not see.
      type: string
    how_to_add:
      description: How to give a subagent skills.
      type: string
    inherits_parent_invoked_skills:
      description: Whether it inherits skills the parent invoked.
      type: boolean
    per_agent_control:
      description: The per-agent setting.
      type: string
    preload:
      description: How skills are preloaded.
      type: string
    setting:
      description: The setting that controls inheritance.
      type: string
    startup:
      description: What a subagent holds at startup.
      type: string
    supported:
      description: 'Whether subagents see skills: true, false or "partial".'
      type: string
  additionalProperties: true
---
