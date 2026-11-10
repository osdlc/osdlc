---
slug: skills/startup-context
category: skills
description: "What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    beyond_cap:
      description: What happens to skills past the cap.
      type: string
    bodies_paths_sources:
      description: Whether bodies, paths and sources are included.
      type: string
    body_at_startup:
      description: Whether bodies are in context at startup.
      type: boolean
    budget:
      description: The context budget for the listing.
      type: string
    cap:
      description: The cap on the listing.
      type: string
    cap_chars_default:
      description: The default per-skill cap, in characters.
      type: string
    cap_covers:
      description: What the cap covers.
      type: string
    cap_setting:
      description: The setting that changes the cap.
      type: string
    catalog_fields:
      description: The fields in the catalog.
      type: string
    configurable_by:
      description: The settings that change the limits.
      type: string
    description_max_chars:
      description: The longest description kept.
      type: string
    disabled_skills:
      description: How disabled skills are handled.
      type: string
    discovered_at:
      description: When skills are discovered.
      type: string
    every_name_listed:
      description: Whether every name is listed.
      type: boolean
    format:
      description: The format of the listing.
      type: string
    full_instructions_included:
      description: Whether full instructions are included.
      type: boolean
    hosted_repository_cap:
      description: The cap on a hosted repository.
      type: string
    listed:
      description: What is listed for each skill.
      type: string
    listing:
      description: Whether a listing exists.
      type: string
    name_max_chars:
      description: The longest name kept.
      type: string
    name_only_option:
      description: The option that lists names only.
      type: string
    over_budget:
      description: What happens over budget.
      type: string
    path_gated:
      description: How path-gated skills are listed.
      type: string
    per_entry_cap_chars:
      description: The per-entry cap, in characters.
      type: string
    position:
      description: Where the listing sits in context.
      type: string
    presented_to_agent:
      description: How the list is presented.
      type: string
    refreshed:
      description: How often the listing refreshes.
      type: string
    size:
      description: The size per skill.
      type: string
  additionalProperties: true
---
