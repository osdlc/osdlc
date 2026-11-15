---
slug: skills/discovery-walk
category: skills
description: "How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders."
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    add_dir:
      description: What an added directory loads.
      type: string
    agents_dir:
      description: How .agents/skills is scanned.
      type: string
    agents_skills_walk:
      description: How the .agents/skills walk runs.
      type: string
    ancestor_dirs:
      description: Whether ancestor directories are scanned.
      type: string
    cli_extra_dirs:
      description: Extra directories the CLI scans.
      type: array
      items:
        type: string
    custom_dirs:
      description: How custom directories are walked.
      type: string
    custom_dirs_nested:
      description: Whether nested skills are found under custom directories.
      type: string
    cycles:
      description: How cycles are avoided.
      type: string
    depth:
      description: How deep a skills root is scanned.
      type: string
    exclusion:
      description: How directories are excluded.
      type: string
    extra_dirs:
      description: The variable that adds directories.
      type: string
    gitignore:
      description: Whether gitignore is used.
      type: string
    global_dir:
      description: The global skills directory.
      type: string
    inside_plugin:
      description: How skills inside a plugin are found.
      type: string
    layout:
      description: The layout of a skill directory.
      type: string
    locations:
      description: The locations scanned, in order.
      type: array
      items:
        type: string
    max_depth:
      description: The deepest level scanned.
      type: string
    nested_dirs:
      description: When nested directories load.
      type: string
    nested_skill_files:
      description: Whether nested skill files are found.
      type: string
    nested_subdirectories:
      description: Whether nested subdirectories are scanned.
      type: boolean
    parent_directories:
      description: How parent directories are read.
      type: string
    parent_dirs:
      description: Whether parent directories up to the repo root are scanned.
      type: string
    parents:
      description: How parent directories are searched.
      type: string
    personal_dirs:
      description: The personal skill directories.
      type: array
      items:
        type: string
    plugins_in_skills_dir:
      description: Whether plugins are searched in parents.
      type: string
    project_dirs:
      description: The project skill directories.
      type: array
      items:
        type: string
    project_root:
      description: How the project root is found.
      type: string
    recursive:
      description: Whether the scan is recursive.
      type:
        - boolean
        - string
    recursive_within_root:
      description: Whether the scan recurses under each root.
      type: boolean
    scan_bounds:
      description: The bounds suggested for scanning.
      type: string
    scope_paths:
      description: The scope paths the standard names.
      type: array
      items:
        type: string
    scoped_to:
      description: What a directory is scoped to.
      type: string
    symlinks:
      description: How symlinked directories are treated.
      type: string
    walk_up:
      description: How far the walk goes up.
      type: string
    workspace_dir:
      description: The workspace skills directory.
      type: string
  additionalProperties: true
---
