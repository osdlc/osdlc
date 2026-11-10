---
slug: skills/project-trust
category: skills
description: Whether project skills load only after the user trusts the folder.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    added_dirs:
      description: How added directories are treated.
      type: string
    allowed_tools_gate:
      description: Whether trust gates allowed-tools.
      type: string
    declined:
      description: What happens when trust is declined.
      type: string
    declined_trust:
      description: What is skipped when trust is declined.
      type: string
    detail:
      description: What the docs say about trust.
      type: string
    project_plugins:
      description: How project plugins are gated.
      type: string
    protected:
      description: Which skills the trust gate protects.
      type: string
    scope:
      description: What the trust gate covers.
      type: string
    skill_folder_as_plugin_in_project:
      description: What a skill folder used as a plugin needs.
      type: string
    supported:
      description: 'Whether project skills wait for trust: true, false or "partial".'
      type:
        - boolean
        - string
    user_skills_affected:
      description: Whether user skills are gated too.
      type: boolean
  additionalProperties: true
---
