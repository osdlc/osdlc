---
slug: skills/live-reload
category: skills
description: Whether adding or editing a skill takes effect in a running session, or needs a restart.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    action:
      description: What the user does to reload.
      type: string
    bare_mode:
      description: What happens in bare mode.
      type: string
    body:
      description: Whether the body is re-read on every load.
      type: string
    catalog:
      description: How the catalog refreshes.
      type: string
    cli:
      description: How the CLI reloads.
      type: string
    command:
      description: The reload command.
      type: string
    delay:
      description: How long a change takes to appear.
      type: string
    detail:
      description: What the docs say about reloading.
      type: string
    live_reload:
      description: 'Whether a change takes effect live: true, false or "partial".'
      type:
        - boolean
        - string
    manual_command:
      description: The command that reloads by hand.
      type: string
    manual_reload:
      description: How a reload is triggered by hand.
      type: string
    new_threads:
      description: What new threads load.
      type: string
    new_top_level_dir:
      description: What a new top-level directory needs.
      type: string
    resource_edits:
      description: Whether edits to resources trigger a refresh.
      type: string
    restart_needed:
      description: Whether a restart is needed.
      type:
        - boolean
        - string
    scope:
      description: What is watched or reloaded.
      type: string
    supported:
      description: 'Whether live reload is supported: true, false or "partial".'
      type:
        - boolean
        - string
    watched:
      description: Which directories are watched.
      type: string
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
