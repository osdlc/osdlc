---
proposition:
  subject: '[pnpm](../../stores/pnpm.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.local/share/pnpm/store
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/pnpm/store
      holds: packages
      rebuild: re-download
    - platform: windows
      path: ~/AppData/Local/pnpm/store
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.cache/pnpm
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/pnpm
      holds: cache
      rebuild: re-download
    - platform: windows
      path: ~/AppData/Local/pnpm-cache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.local/state/pnpm
      holds: state
      rebuild: rebuild
    - platform: macos
      path: ~/.local/state/pnpm
      holds: state
      rebuild: rebuild
    - platform: windows
      path: ~/AppData/Local/pnpm-state
      holds: state
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pnpm data directories 1](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%201.md)'
  - '[2026-11-21 pnpm data directories 2](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%202.md)'
  - '[2026-11-21 pnpm data directories 3](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%203.md)'
  - '[2026-11-21 pnpm data directories 4](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%204.md)'
  - '[2026-11-21 pnpm data directories 5](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%205.md)'
  - '[2026-11-21 pnpm data directories 6](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%206.md)'
  - '[2026-11-21 pnpm data directories 7](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%207.md)'
  - '[2026-11-21 pnpm data directories 8](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%208.md)'
  - '[2026-11-21 pnpm data directories 9](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%209.md)'
  - '[2026-11-21 pnpm data directories 10](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%2010.md)'
  - '[2026-11-21 pnpm data directories 11](../../study-results/pnpm/2026-11-21%20pnpm%20data%20directories%2011.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The storeDir, cacheDir and stateDir settings pages list the default per platform; on a
    disk without a home directory the store is <disk root>/.pnpm-store instead.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pnpm](../../stores/pnpm.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether deleting stateDir loses anything beyond the update checker state and run-slot files is not stated.
---

The storeDir, cacheDir and stateDir settings pages list the default per platform; on a disk without a home directory the store is <disk root>/.pnpm-store instead.
