---
slug: skill-frontmatter/unknown-keys
category: skill-frontmatter
description: "What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    allowed_tools_for_other_agents:
      description: What happens to allowed-tools written for another agent.
      type: string
    behavior:
      description: What the harness does with an unknown key.
      type: string
    documented_keys:
      description: The keys the docs name.
      type: array
      items:
        type: string
    invalid_invocation_value:
      description: What happens on an invalid invocation value.
      type: string
    invalid_name_or_no_frontmatter:
      description: What happens on an invalid name or missing frontmatter.
      type: string
    known_keys:
      description: The keys the harness knows.
      type: array
      items:
        type: string
    validated:
      description: The keys the harness validates.
      type: array
      items:
        type: string
  additionalProperties: true
---
