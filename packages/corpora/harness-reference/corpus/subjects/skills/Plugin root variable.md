---
slug: skills/plugin-root-variable
category: skills
description: Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    aliases:
      description: Other names the variable is also known by.
      type: array
      items:
        type: string
    also_env_var:
      description: An environment variable set alongside.
      type: string
    also_set:
      description: Variables also set for compatibility.
      type: string
    context:
      description: Where the variable is used.
      type: string
    data_resolves_to:
      description: Where the data variable points.
      type: string
    data_variable:
      description: The variable for the plugin data folder.
      type: string
    documented_use:
      description: The use the docs give.
      type: string
    hooks:
      description: How hooks relate to the variable.
      type: string
    meaning:
      description: What the variable means.
      type: string
    not_expanded:
      description: Variables the harness does not expand.
      type: array
      items:
        type: string
    not_in:
      description: Fields where it is not substituted.
      type: string
    not_in_bash_tool_env:
      description: Whether it is absent from the bash tool environment.
      type: boolean
    plugin_root:
      description: What the plugin root is.
      type: string
    requirement:
      description: What the standard requires of clients.
      type: string
    resolves_to:
      description: Where the variable points.
      type: string
    skills_substitution_note:
      description: Where substitution occurs for skills.
      type: string
    substituted_in:
      description: Where the variable is substituted.
      type:
        - array
        - string
      items:
        type: string
    substituted_in_skill_also:
      description: Other skill fields where it is substituted.
      type: string
    symlinks:
      description: How symlinks in the path are handled.
      type: string
    variable:
      description: The variable that names the folder.
      type: string
    variables:
      description: The variables that name the folder.
      type: array
      items:
        type: string
  additionalProperties: true
---
