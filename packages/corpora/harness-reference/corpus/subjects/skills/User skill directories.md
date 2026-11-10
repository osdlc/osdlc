---
slug: skills/user-dirs
category: skills
description: Directories in the home directory the harness loads skills from.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    deprecated:
      description: Directories now deprecated.
      type: array
      items:
        type: string
    dirs:
      description: The user skill directories, starting with ~/.
      type: array
      items:
        type: string
    moved_from:
      description: Where the directory used to be.
      type: string
    order:
      description: Where they rank against project roots.
      type: string
  additionalProperties: true
---
