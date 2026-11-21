---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.stack
      holds: packages
      rebuild: rebuild
    - platform: macos
      path: ~/.stack
      holds: packages
      rebuild: rebuild
    - platform: linux
      path: ~/.stack/programs
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/.stack/programs
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.stack/snapshots
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/.stack/snapshots
      holds: build-output
      rebuild: rebuild
    - platform: linux
      path: ~/.stack/pantry/hackage
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/.stack/pantry/hackage
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.stack/setup-exe-cache
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/.stack/setup-exe-cache
      holds: build-output
      rebuild: rebuild
    - platform: windows
      path: '%APPDATA%\stack'
      holds: packages
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\Programs\stack'
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.local/share/stack
      holds: packages
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack data directories 1](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%201.md)'
  - '[2026-11-21 Stack data directories 2](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%202.md)'
  - '[2026-11-21 Stack data directories 3](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%203.md)'
  - '[2026-11-21 Stack data directories 4](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%204.md)'
  - '[2026-11-21 Stack data directories 5](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%205.md)'
  - '[2026-11-21 Stack data directories 6](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%206.md)'
  - '[2026-11-21 Stack data directories 7](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%207.md)'
  - '[2026-11-21 Stack data directories 8](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%208.md)'
  - '[2026-11-21 Stack data directories 9](../../study-results/Stack/2026-11-21%20Stack%20data%20directories%209.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Stack root topic gives ~/.stack (Unix-like), %APPDATA%\stack with tools in %LOCALAPPDATA%\Programs\stack
    (Windows) and ~/.local/share/stack under XDG, and says for each subdirectory what Stack does if it
    is deleted.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Stack root also holds config.yaml, the global project and upload credentials; only programs, snapshots,
  pantry/hackage and setup-exe-cache are described as safe to delete.
---

The Stack root topic gives ~/.stack (Unix-like), %APPDATA%\stack with tools in %LOCALAPPDATA%\Programs\stack (Windows) and ~/.local/share/stack under XDG, and says for each subdirectory what Stack does if it is deleted.
