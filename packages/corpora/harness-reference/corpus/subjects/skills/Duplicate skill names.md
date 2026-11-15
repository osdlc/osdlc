---
slug: skills/duplicate-names
category: skills
description: "What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    across_plugins:
      description: How same-named skills in different plugins are told apart.
      type: string
    across_scope_layers:
      description: Which layer wins across scope layers.
      type: string
    across_scopes:
      description: "Which scope wins: project, user or others."
      type: string
    behavior:
      description: What happens when two skills share a name.
      type: string
    built_in_skills:
      description: Where built-in skills rank.
      type: string
    builtin_collision:
      description: What happens when a skill collides with a built-in.
      type: string
    collision:
      description: The diagnostic logged on a collision.
      type: string
    diagnostic:
      description: The diagnostic level raised.
      type: string
    enterprise_personal_project:
      description: Precedence among enterprise, personal and project skills.
      type: string
    extension_skills:
      description: How extension skills are named.
      type: string
    guidance:
      description: What the docs advise about names.
      type: string
    mention:
      description: How a by-name mention resolves.
      type: string
    order:
      description: The precedence order of locations.
      type:
        - array
        - string
      items:
        type: string
    order_low_to_high:
      description: Layers from lowest to highest precedence.
      type: array
      items:
        type: string
    other_lookup:
      description: How other lookups resolve.
      type: string
    plugin_skill:
      description: Whether a plugin skill overrides a native one.
      type: string
    plugin_skills:
      description: How plugin skills are qualified.
      type: string
    plugin_vs_other_locations:
      description: How a plugin skill coexists with other locations.
      type: string
    result:
      description: The outcome of a collision.
      type: string
    rule:
      description: The rule applied on a collision.
      type: string
    same_plugin_two_marketplaces:
      description: How one plugin from two marketplaces resolves.
      type: string
    user_vs_bundled:
      description: How a user skill relates to a bundled one.
      type: string
    winner:
      description: Which skill wins.
      type: string
    within_one_layer:
      description: Which wins within one layer.
      type: string
    within_root:
      description: Which wins within one root.
      type: string
    within_scope:
      description: Which wins within one scope.
      type: string
  additionalProperties: true
---
