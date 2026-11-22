---
proposition:
  subject: '[pip](../../stores/pip.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/pip
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/pip
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LocalAppData%\pip\Cache'
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pip data directories 1](../../study-results/pip/2026-11-21%20pip%20data%20directories%201.md)'
  - '[2026-11-21 pip data directories 2](../../study-results/pip/2026-11-21%20pip%20data%20directories%202.md)'
  - '[2026-11-21 pip data directories 3](../../study-results/pip/2026-11-21%20pip%20data%20directories%203.md)'
  - '[2026-11-21 pip data directories 4](../../study-results/pip/2026-11-21%20pip%20data%20directories%204.md)'
  - '[2026-11-21 pip data directories 5](../../study-results/pip/2026-11-21%20pip%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The caching topic lists the default cache path per platform and says the cache exists to
    avoid duplicate downloads and builds; the wheel part is rebuilt locally from sdists when it is missing.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pip](../../stores/pip.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Locally built wheels in the cache are rebuilt rather than re-downloaded; the dirs list records the dominant
  cost (re-download) for the whole cache.
---

The caching topic lists the default cache path per platform and says the cache exists to avoid duplicate downloads and builds; the wheel part is rebuilt locally from sdists when it is missing.
