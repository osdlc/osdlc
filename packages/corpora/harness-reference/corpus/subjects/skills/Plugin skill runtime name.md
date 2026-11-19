---
slug: skills/plugin-namespace
category: skills
description: The name a skill gets when it ships in a plugin, for plugin `acme-tools` and skill `review`.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    bare_alias:
      description: Whether the bare skill name also invokes it.
      type: string
    namespace:
      description: The prefix added to a plugin skill name.
      type: string
    namespace_from:
      description: Where the prefix comes from.
      type: string
    runtime_name:
      description: The name the skill gets at runtime.
      type: string
  additionalProperties: true
---
