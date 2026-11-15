---
slug: skills/project-dirs
category: skills
description: Directories in the project the harness loads skills from.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    dirs:
      description: The project skill directories.
      type: array
      items:
        type: string
    dirs_setting:
      description: The setting that adds directories.
      type: string
    layout:
      description: The skill layout inside a directory.
      type: string
    legacy:
      description: Directories read for compatibility.
      type: array
      items:
        type: string
    nested:
      description: Whether nested directories are scanned.
      type: boolean
    order:
      description: The order directories are consulted.
      type: string
    scope:
      description: Where the directories are looked for.
      type: string
  additionalProperties: true
---
