---
proposition:
  subject: '[Neovim](../../stores/Neovim.md)'
  predicate: location/override
  object:
    vars:
    - XDG_DATA_HOME
    - XDG_STATE_HOME
    - XDG_CACHE_HOME
    - NVIM_APPNAME
    - NVIM_LOG_FILE
    settings:
    - lazy.nvim root
    - mason.nvim install_root_dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Neovim location overrides 1](../../study-results/Neovim/2026-11-21%20Neovim%20location%20overrides%201.md)'
  - '[2026-11-21 Neovim location overrides 2](../../study-results/Neovim/2026-11-21%20Neovim%20location%20overrides%202.md)'
  - '[2026-11-21 Neovim location overrides 3](../../study-results/Neovim/2026-11-21%20Neovim%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Neovim follows the XDG variables and NVIM_APPNAME renames the subdirectory; the plugin
    managers expose root and install_root_dir options.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Neovim](../../stores/Neovim.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Neovim follows the XDG variables and NVIM_APPNAME renames the subdirectory; the plugin managers expose root and install_root_dir options.
