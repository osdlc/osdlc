---
proposition:
  subject: '[Neovim](../../stores/Neovim.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: :Lazy clean
      removes: plugins lazy.nvim no longer has in its spec
    - command: :MasonUninstall <package>
      removes: the named mason.nvim packages
    - command: :MasonUninstallAll
      removes: all mason.nvim packages
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Neovim clean command 1](../../study-results/Neovim/2026-11-21%20Neovim%20clean%20command%201.md)'
  - '[2026-11-21 Neovim clean command 2](../../study-results/Neovim/2026-11-21%20Neovim%20clean%20command%202.md)'
  - '[2026-11-21 Neovim clean command 3](../../study-results/Neovim/2026-11-21%20Neovim%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Neovim has no cleanup command of its own; lazy.nvim and mason.nvim document these commands.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Neovim](../../stores/Neovim.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source gives a command that clears stdpath('cache') or old logs.
---

Neovim has no cleanup command of its own; lazy.nvim and mason.nvim document these commands.
