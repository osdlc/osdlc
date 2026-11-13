---
slug: skills/bundled-files
category: skills
description: Whether files beside SKILL.md (scripts, references, assets) load into context without
  being asked for.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    access:
      description: How the model reaches bundled files.
      type: string
    activation_tool_listing:
      description: What the activation tool does with bundled files.
      type: string
    auto_loaded:
      description: Whether bundled files load without being asked for.
      type:
        - boolean
        - string
    autoloaded:
      description: Whether bundled files load without being asked for.
      type: boolean
    contents_autoloaded:
      description: Whether file contents load without being asked for.
      type: boolean
    detail:
      description: What the docs say about bundled files.
      type: string
    directory_access:
      description: How the skill directory becomes readable.
      type: string
    file_names_listed:
      description: How many file names are listed to the model.
      type: string
    guidance:
      description: What the docs advise about bundled files.
      type: string
    layout:
      description: The folders the harness expects beside SKILL.md.
      type: string
    references_dir:
      description: How the references folder loads.
      type: string
    seen_on_load:
      description: What the model sees on load.
      type: string
    supported:
      description: 'Whether bundled files are supported: true, false or "partial".'
      type:
        - boolean
        - string
    basis:
      description: "How an answer of false or absent is known: stated in the docs, left out of the help
        text, or never mentioned."
      enum:
        - documented
        - omitted-from-help
        - undocumented
  additionalProperties: true
---
