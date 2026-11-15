---
slug: skills/body-size
category: skills
description: Limits or guidance on the SKILL.md body size, and what happens past them.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    advice:
      description: What the docs advise.
      type: string
    after_compaction:
      description: What survives compaction.
      type: string
    applies_to_local:
      description: Whether the limit applies to local skills.
      type: boolean
    cap:
      description: The cap on the body.
      type: string
    detail:
      description: What the docs say about size.
      type: string
    guidance:
      description: What the docs advise.
      type: string
    hosted_max_file:
      description: Largest file in a hosted skill.
      type: string
    hosted_max_files_per_skill:
      description: Most files in a hosted skill.
      type: string
    hosted_max_skill:
      description: Largest hosted skill.
      type: string
    numeric_limit:
      description: Whether a numeric limit exists.
      type:
        - boolean
        - string
    recommendation:
      description: The size the docs recommend.
      type: string
    remedy:
      description: What to do about a large body.
      type: string
    same_cap_as:
      description: The tool whose cap applies.
      type: string
  additionalProperties: true
---
