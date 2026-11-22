---
proposition:
  subject: '[pacman](../../stores/pacman.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/cache/pacman/pkg
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pacman data directories 1](../../study-results/pacman/2026-11-21%20pacman%20data%20directories%201.md)'
  - '[2026-11-21 pacman data directories 2](../../study-results/pacman/2026-11-21%20pacman%20data%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The man page gives the default cache and the ArchWiki says old versions accumulate there;
    deleting them loses the ability to downgrade offline.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pacman](../../stores/pacman.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The man page gives the default cache and the ArchWiki says old versions accumulate there; deleting them loses the ability to downgrade offline.
