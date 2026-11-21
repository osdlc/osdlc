---
proposition:
  subject: '[npm](../../stores/npm.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.npm/_cacache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.npm/_cacache
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/.npm/_npx
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.npm/_npx
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/.npm/_logs
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.npm/_logs
      holds: logs
      rebuild: lost
    - platform: windows
      path: '%LocalAppData%/npm-cache'
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 npm data directories 1](../../study-results/npm/2026-11-21%20npm%20data%20directories%201.md)'
  - '[2026-11-21 npm data directories 2](../../study-results/npm/2026-11-21%20npm%20data%20directories%202.md)'
  - '[2026-11-21 npm data directories 3](../../study-results/npm/2026-11-21%20npm%20data%20directories%203.md)'
  - '[2026-11-21 npm data directories 4](../../study-results/npm/2026-11-21%20npm%20data%20directories%204.md)'
  - '[2026-11-21 npm data directories 5](../../study-results/npm/2026-11-21%20npm%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The folders doc gives the cache root per platform; npm-cache and the config source name
    the _cacache and _npx subdirectories and the logging doc names _logs; on Windows the same subdirectories
    sit under %LocalAppData%/npm-cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[npm](../../stores/npm.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Global installs live under the prefix (/usr/local/lib/node_modules or %AppData%\npm) and are not counted
  here as reclaimable.
---

The folders doc gives the cache root per platform; npm-cache and the config source name the _cacache and _npx subdirectories and the logging doc names _logs; on Windows the same subdirectories sit under %LocalAppData%/npm-cache.
