---
proposition:
  subject: '[Volta](../../stores/Volta.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.volta/tools/image
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.volta/tools/image
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/.volta/tools/inventory
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: ~/.volta/tools/inventory
      holds: downloads
      rebuild: re-download
    - platform: macos
      path: ~/.volta/cache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.volta/cache
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Volta'
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Volta data directories 1](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%201.md)'
  - '[2026-11-21 Volta data directories 2](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%202.md)'
  - '[2026-11-21 Volta data directories 3](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%203.md)'
  - '[2026-11-21 Volta data directories 4](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%204.md)'
  - '[2026-11-21 Volta data directories 5](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%205.md)'
  - '[2026-11-21 Volta data directories 6](../../study-results/Volta/2026-11-21%20Volta%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The installers doc gives VOLTA_HOME defaults per platform; the v4 layout source names cache/,
    tools/inventory/ and tools/image/ inside it.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Volta](../../stores/Volta.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Which of tools/inventory and tools/image holds archives versus unpacked versions is inferred from directory
  names, not stated in prose.
---

The installers doc gives VOLTA_HOME defaults per platform; the v4 layout source names cache/, tools/inventory/ and tools/image/ inside it.
