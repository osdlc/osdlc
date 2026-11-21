---
proposition:
  subject: '[DNF](../../stores/DNF.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/cache/libdnf5
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.cache/libdnf5
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 DNF data directories 1](../../study-results/DNF/2026-11-21%20DNF%20data%20directories%201.md)'
  - '[2026-11-21 DNF data directories 2](../../study-results/DNF/2026-11-21%20DNF%20data%20directories%202.md)'
  - '[2026-11-21 DNF data directories 3](../../study-results/DNF/2026-11-21%20DNF%20data%20directories%203.md)'
  - '[2026-11-21 DNF data directories 4](../../study-results/DNF/2026-11-21%20DNF%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: dnf5.conf(5) gives the superuser and regular-user cache dirs; downloaded packages only
    pile up when keepcache is enabled.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[DNF](../../stores/DNF.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- DNF 4 (RHEL and older Fedora) uses /var/cache/dnf by convention, but its conf reference gives only a
  distribution-dependent default.
---

dnf5.conf(5) gives the superuser and regular-user cache dirs; downloaded packages only pile up when keepcache is enabled.
