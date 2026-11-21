---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: $XDG_CACHE_HOME/uv
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.cache/uv
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/.cache/uv
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\uv\cache'
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/uv/python
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/uv/python
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/uv/tools
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/uv/tools
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv data directories 1](../../study-results/uv/2026-11-21%20uv%20data%20directories%201.md)'
  - '[2026-11-21 uv data directories 2](../../study-results/uv/2026-11-21%20uv%20data%20directories%202.md)'
  - '[2026-11-21 uv data directories 3](../../study-results/uv/2026-11-21%20uv%20data%20directories%203.md)'
  - '[2026-11-21 uv data directories 4](../../study-results/uv/2026-11-21%20uv%20data%20directories%204.md)'
  - '[2026-11-21 uv data directories 5](../../study-results/uv/2026-11-21%20uv%20data%20directories%205.md)'
  - '[2026-11-21 uv data directories 6](../../study-results/uv/2026-11-21%20uv%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The storage reference gives the cache and persistent-data directories (XDG on Linux and
    macOS, Known Folders on Windows) and says managed Pythons and tools live in python/ and tools/ under
    the data directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The storage page gives the Windows persistent data directory as %APPDATA%\uv\data only in a table, so
  the Windows python and tools paths are not listed here.
- Deleting managed Pythons breaks virtual environments that point at them until they are re-created.
---

The storage reference gives the cache and persistent-data directories (XDG on Linux and macOS, Known Folders on Windows) and says managed Pythons and tools live in python/ and tools/ under the data directory.
