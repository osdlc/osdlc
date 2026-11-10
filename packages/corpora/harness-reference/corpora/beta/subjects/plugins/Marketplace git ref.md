---
slug: plugins/marketplace-git-ref
category: plugins
description: Can a marketplace or plugin be added from a git branch, tag or commit?
valueSchema:
  description: Adding a source at a git ref.
  type: object
  properties:
    supported:
      description: 'Whether the harness supports it: true, false, or "partial" where only part works.'
      type:
        - boolean
        - string
      enum:
        - true
        - false
        - partial
    ref_syntax:
      description: How a ref is written, such as owner/repo@ref.
      type: string
    kinds:
      description: Ref kinds accepted.
      type: array
      items:
        enum:
          - branch
          - tag
          - commit
    argv:
      description: The arguments that add a source at a ref.
      type: array
      items:
        type: string
    subpath:
      description: How a subfolder of the repository is named.
      type: string
    note:
      description: A caveat the other keys do not carry.
      type: string
  additionalProperties: true
---

To pin a plugin source, a caller needs to name a git ref. This subject records whether a ref (branch, tag or commit) may be given when a marketplace or plugin is added, the syntax for it and how a subfolder of the repository is named.
