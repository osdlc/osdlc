---
proposition:
  subject: '[Neovim](../../stores/Neovim.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: :Lazy
      shows: the plugin list and its install state
    - command: :Mason
      shows: installed and available mason.nvim packages
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Neovim inventory command 1](../../study-results/Neovim/2026-11-21%20Neovim%20inventory%20command%201.md)'
  - '[2026-11-21 Neovim inventory command 2](../../study-results/Neovim/2026-11-21%20Neovim%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Both plugin managers document a status UI; neither reports disk sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Neovim](../../stores/Neovim.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Both plugin managers document a status UI; neither reports disk sizes.
