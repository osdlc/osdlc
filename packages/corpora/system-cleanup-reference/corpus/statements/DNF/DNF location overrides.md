---
proposition:
  subject: '[DNF](../../stores/DNF.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - cachedir
    - system_cachedir
    - keepcache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 DNF location overrides 1](../../study-results/DNF/2026-11-21%20DNF%20location%20overrides%201.md)'
  - '[2026-11-21 DNF location overrides 2](../../study-results/DNF/2026-11-21%20DNF%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: cachedir and system_cachedir in dnf5.conf move the cache; keepcache decides whether packages
    are kept.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[DNF](../../stores/DNF.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

cachedir and system_cachedir in dnf5.conf move the cache; keepcache decides whether packages are kept.
