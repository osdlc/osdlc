---
proposition:
  subject: '[Bundler](../../stores/Bundler.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.bundle/cache
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bundler data directories 1](../../study-results/Bundler/2026-11-21%20Bundler%20data%20directories%201.md)'
  - '[2026-11-21 Bundler data directories 2](../../study-results/Bundler/2026-11-21%20Bundler%20data%20directories%202.md)'
  - '[2026-11-21 Bundler data directories 3](../../study-results/Bundler/2026-11-21%20Bundler%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching guide gives ~/.bundle/cache as Bundler's per-user cache; gems themselves go
    into the RubyGems gem home unless a path is configured, which the RubyGems entry covers.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bundler](../../stores/Bundler.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source gives a Windows-specific spelling of ~/.bundle/cache.
---

The caching guide gives ~/.bundle/cache as Bundler's per-user cache; gems themselves go into the RubyGems gem home unless a path is configured, which the RubyGems entry covers.
