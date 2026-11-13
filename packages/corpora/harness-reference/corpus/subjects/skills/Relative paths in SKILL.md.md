---
slug: skills/relative-paths
category: skills
description: What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.
model_dependent: true
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    base_directory_line:
      description: The line the harness gives the model about the base folder.
      type: string
    env_var:
      description: A variable set to the skill folder.
      type: string
    line:
      description: The base-directory line the harness writes.
      type: string
    model_told_location:
      description: Whether the model is told the folder.
      type: boolean
    plugin_helper_scripts:
      description: How plugin helper scripts are run.
      type: string
    resolves_from:
      description: The folder a relative path resolves from.
      type: string
    resolves_to:
      description: What a relative path resolves to.
      type: string
    stated_for:
      description: Whom the statement applies to.
      type: string
    tells_model:
      description: Whether the harness tells the model the folder.
      type:
        - boolean
        - string
    variable:
      description: The variable for the skill folder.
      type: string
  additionalProperties: true
---
