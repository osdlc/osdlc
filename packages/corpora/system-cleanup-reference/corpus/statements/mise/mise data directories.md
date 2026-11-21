---
proposition:
  subject: '[mise](../../stores/mise.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.local/share/mise/installs
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/mise/installs
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\mise'
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/mise/downloads
      holds: downloads
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/mise/downloads
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: ~/.cache/mise
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/mise
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%TEMP%\mise'
      holds: cache
      rebuild: re-download
    - platform: all
      path: $MISE_CACHE_DIR/downloads-cas
      holds: downloads
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 mise data directories 1](../../study-results/mise/2026-11-21%20mise%20data%20directories%201.md)'
  - '[2026-11-21 mise data directories 2](../../study-results/mise/2026-11-21%20mise%20data%20directories%202.md)'
  - '[2026-11-21 mise data directories 3](../../study-results/mise/2026-11-21%20mise%20data%20directories%203.md)'
  - '[2026-11-21 mise data directories 4](../../study-results/mise/2026-11-21%20mise%20data%20directories%204.md)'
  - '[2026-11-21 mise data directories 5](../../study-results/mise/2026-11-21%20mise%20data%20directories%205.md)'
  - '[2026-11-21 mise data directories 6](../../study-results/mise/2026-11-21%20mise%20data%20directories%206.md)'
  - '[2026-11-21 mise data directories 7](../../study-results/mise/2026-11-21%20mise%20data%20directories%207.md)'
  - '[2026-11-21 mise data directories 8](../../study-results/mise/2026-11-21%20mise%20data%20directories%208.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The mise Directories page gives the per-platform defaults for the cache and the installed-tools
    data directory, the installs/ and downloads/ subdirectories, and the settings reference names downloads-cas
    inside the cache as the download cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[mise](../../stores/mise.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The per-platform default paths come from a Markdown table; the Windows path of the transient downloads/
  directory is not spelled out.
---

The mise Directories page gives the per-platform defaults for the cache and the installed-tools data directory, the installs/ and downloads/ subdirectories, and the settings reference names downloads-cas inside the cache as the download cache.
