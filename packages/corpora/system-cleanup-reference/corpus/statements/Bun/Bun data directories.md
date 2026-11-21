---
proposition:
  subject: '[Bun](../../stores/Bun.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.bun/install/cache
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bun data directories 1](../../study-results/Bun/2026-11-21%20Bun%20data%20directories%201.md)'
  - '[2026-11-21 Bun data directories 2](../../study-results/Bun/2026-11-21%20Bun%20data%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The global cache doc gives one default path with no platform qualifier.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bun](../../stores/Bun.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs do not say whether the Windows default differs from ~/.bun/install/cache.
---

The global cache doc gives one default path with no platform qualifier.
