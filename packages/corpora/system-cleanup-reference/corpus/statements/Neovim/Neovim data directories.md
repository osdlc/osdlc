---
proposition:
  subject: '[Neovim](../../stores/Neovim.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.local/share/nvim/lazy
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/nvim/lazy
      holds: packages
      rebuild: re-download
    - platform: windows
      path: ~/AppData/Local/nvim-data/lazy
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/nvim/mason
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/nvim/mason
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: ~/AppData/Local/nvim-data/mason
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.cache/nvim
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/.cache/nvim
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: ~/AppData/Local/Temp/nvim-data
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: ~/.local/state/nvim
      holds: state
      rebuild: lost
    - platform: macos
      path: ~/.local/state/nvim
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.local/state/nvim/logs
      holds: logs
      rebuild: lost
    - platform: macos
      path: ~/.local/state/nvim/logs
      holds: logs
      rebuild: lost
    - platform: windows
      path: ~/AppData/Local/nvim-data/logs
      holds: logs
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Neovim data directories 1](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%201.md)'
  - '[2026-11-21 Neovim data directories 2](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%202.md)'
  - '[2026-11-21 Neovim data directories 3](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%203.md)'
  - '[2026-11-21 Neovim data directories 4](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%204.md)'
  - '[2026-11-21 Neovim data directories 5](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%205.md)'
  - '[2026-11-21 Neovim data directories 6](../../study-results/Neovim/2026-11-21%20Neovim%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Neovim's starting docs give the stdpath defaults (Unix covers Linux and macOS); lazy.nvim's
    and mason.nvim's default configs put their installs under stdpath('data').
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Neovim](../../stores/Neovim.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The state directory holds shada, undo and swap files, which are user data; no source here lists its
  contents.
- Other plugin managers (packer, vim-plug, built-in vim.pack) use other folders not covered here.
---

Neovim's starting docs give the stdpath defaults (Unix covers Linux and macOS); lazy.nvim's and mason.nvim's default configs put their installs under stdpath('data').
