---
proposition:
  subject: '[Sublime Text](../../stores/Sublime%20Text.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: windows
      path: '%LOCALAPPDATA%\Sublime Text'
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Caches/Sublime Text
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: ~/.cache/sublime-text
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Sublime Text data directories 1](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20data%20directories%201.md)'
  - '[2026-11-21 Sublime Text data directories 2](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20data%20directories%202.md)'
  - '[2026-11-21 Sublime Text data directories 3](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20data%20directories%203.md)'
  - '[2026-11-21 Sublime Text data directories 4](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20data%20directories%204.md)'
  - '[2026-11-21 Sublime Text data directories 5](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The revert page lists the cache directory per platform, separate from the data directory
    that holds settings and packages; the indexing page describes the symbol index the editor builds by
    scanning project files.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Sublime Text](../../stores/Sublime%20Text.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs do not say the index lives in the cache directory, or name its subfolder.
- Sublime Text 3 used cache folders ending in 3 (the docs show %LOCALAPPDATA%\Sublime Text 3 on Windows);
  other platforms' ST3 cache names are not given.
---

The revert page lists the cache directory per platform, separate from the data directory that holds settings and packages; the indexing page describes the symbol index the editor builds by scanning project files.
