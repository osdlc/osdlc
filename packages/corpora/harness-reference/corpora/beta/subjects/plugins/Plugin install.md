---
slug: plugins/install
category: plugins
description: How a plugin or package is installed.
valueSchema:
  description: The value of a statement about this subject. Other keys are allowed.
  type: object
  properties:
    claude_plugins:
      description: What happens to a Claude Code plugin on install.
      type: string
    commands:
      description: The install commands.
      type: array
      items:
        type: string
    note:
      description: A caveat about install.
      type: string
    recorded_in:
      description: Where the install is recorded.
      type: string
    sources:
      description: What can be installed.
      type: string
  additionalProperties: true
---
