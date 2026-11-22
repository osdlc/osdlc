---
proposition:
  subject: '[pacman](../../stores/pacman.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - CacheDir
    - CleanMethod
    - --cachedir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pacman location overrides 1](../../study-results/pacman/2026-11-21%20pacman%20location%20overrides%201.md)'
  - '[2026-11-21 pacman location overrides 2](../../study-results/pacman/2026-11-21%20pacman%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: CacheDir in pacman.conf (or --cachedir) moves the cache; CleanMethod changes what -Sc removes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pacman](../../stores/pacman.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

CacheDir in pacman.conf (or --cachedir) moves the cache; CleanMethod changes what -Sc removes.
