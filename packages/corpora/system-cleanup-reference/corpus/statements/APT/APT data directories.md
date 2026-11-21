---
proposition:
  subject: '[APT](../../stores/APT.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/cache/apt/archives
      holds: packages
      rebuild: re-download
    - platform: linux
      path: /var/cache/apt/archives/partial
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: /var/lib/apt/lists
      holds: state
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 APT data directories 1](../../study-results/APT/2026-11-21%20APT%20data%20directories%201.md)'
  - '[2026-11-21 APT data directories 2](../../study-results/APT/2026-11-21%20APT%20data%20directories%202.md)'
  - '[2026-11-21 APT data directories 3](../../study-results/APT/2026-11-21%20APT%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The apt-get FILES section lists the archive cache and its partial directory; distclean
    shows the lists directory is reclaimable and refetched by apt-get update.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[APT](../../stores/APT.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The apt-get FILES section lists the archive cache and its partial directory; distclean shows the lists directory is reclaimable and refetched by apt-get update.
