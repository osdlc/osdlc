---
proposition:
  subject: '[Yarn](../../stores/Yarn.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.yarn/berry/cache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.yarn/berry/cache
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Yarn\Berry\cache'
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.cache/yarn
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/Yarn
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Yarn\Cache'
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Yarn data directories 1](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%201.md)'
  - '[2026-11-21 Yarn data directories 2](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%202.md)'
  - '[2026-11-21 Yarn data directories 3](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%203.md)'
  - '[2026-11-21 Yarn data directories 4](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%204.md)'
  - '[2026-11-21 Yarn data directories 5](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%205.md)'
  - '[2026-11-21 Yarn data directories 6](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%206.md)'
  - '[2026-11-21 Yarn data directories 7](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%207.md)'
  - '[2026-11-21 Yarn data directories 8](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%208.md)'
  - '[2026-11-21 Yarn data directories 9](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%209.md)'
  - '[2026-11-21 Yarn data directories 10](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%2010.md)'
  - '[2026-11-21 Yarn data directories 11](../../study-results/Yarn/2026-11-21%20Yarn%20data%20directories%2011.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Berry rows (first three) come from the global folder default in folderUtils.ts plus the
    /cache suffix in Configuration.ts; Classic rows (last three) come from Yarn 1's getCacheDir, which
    appends Cache to %LOCALAPPDATA%\Yarn on Windows; Classic stores entries in a versioned subfolder (v6)
    of that directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Yarn](../../stores/Yarn.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The globalFolder also holds a metadata cache and other files whose individual subpaths are not documented.
---

Berry rows (first three) come from the global folder default in folderUtils.ts plus the /cache suffix in Configuration.ts; Classic rows (last three) come from Yarn 1's getCacheDir, which appends Cache to %LOCALAPPDATA%\Yarn on Windows; Classic stores entries in a versioned subfolder (v6) of that directory.
