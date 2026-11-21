---
proposition:
  subject: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.vscode/extensions
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.vscode/extensions
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%\.vscode\extensions'
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Code/User/workspaceStorage
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.config/Code/User/workspaceStorage
      holds: state
      rebuild: lost
    - platform: windows
      path: '%APPDATA%\Code\User\workspaceStorage'
      holds: state
      rebuild: lost
    - platform: macos
      path: ~/Library/Application Support/Code/CachedExtensionVSIXs
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: ~/.config/Code/CachedExtensionVSIXs
      holds: downloads
      rebuild: re-download
    - platform: windows
      path: '%APPDATA%\Code\CachedExtensionVSIXs'
      holds: downloads
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Code/logs
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.config/Code/logs
      holds: logs
      rebuild: lost
    - platform: windows
      path: '%APPDATA%\Code\logs'
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.config/Code/GPUCache
      holds: cache
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio Code data directories 1](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%201.md)'
  - '[2026-11-21 Visual Studio Code data directories 2](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%202.md)'
  - '[2026-11-21 Visual Studio Code data directories 3](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%203.md)'
  - '[2026-11-21 Visual Studio Code data directories 4](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%204.md)'
  - '[2026-11-21 Visual Studio Code data directories 5](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%205.md)'
  - '[2026-11-21 Visual Studio Code data directories 6](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%206.md)'
  - '[2026-11-21 Visual Studio Code data directories 7](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%207.md)'
  - '[2026-11-21 Visual Studio Code data directories 8](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%208.md)'
  - '[2026-11-21 Visual Studio Code data directories 9](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%209.md)'
  - '[2026-11-21 Visual Studio Code data directories 10](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%2010.md)'
  - '[2026-11-21 Visual Studio Code data directories 11](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%2011.md)'
  - '[2026-11-21 Visual Studio Code data directories 12](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20data%20directories%2012.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The docs give the extensions folder and the user data directory per platform (%APPDATA%\Code,
    ~/Library/Application Support/Code, ~/.config/Code); VS Code's source puts workspaceStorage under
    <user data>/User and logs and CachedExtensionVSIXs directly under <user data>; the FAQ names GPUCache
    as safe to delete.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The CachedData, Cache and CachedExtensions directories are not covered by the sources read.
- No source says whether deleting workspaceStorage entries is safe; it holds per-workspace extension and
  UI state, so it is marked lost.
- Whether VS Code removes superseded extension versions from the extensions folder on its own is not covered.
---

The docs give the extensions folder and the user data directory per platform (%APPDATA%\Code, ~/Library/Application Support/Code, ~/.config/Code); VS Code's source puts workspaceStorage under <user data>/User and logs and CachedExtensionVSIXs directly under <user data>; the FAQ names GPUCache as safe to delete.
