---
proposition:
  subject: '[Snap](../../stores/Snap.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/lib/snapd/snaps
      holds: packages
      rebuild: re-download
    - platform: linux
      path: /var/lib/snapd/cache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: /var/lib/snapd/snapshots
      holds: state
      rebuild: lost
    - platform: linux
      path: /var/snap
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/snap
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Snap data directories 1](../../study-results/Snap/2026-11-21%20Snap%20data%20directories%201.md)'
  - '[2026-11-21 Snap data directories 2](../../study-results/Snap/2026-11-21%20Snap%20data%20directories%202.md)'
  - '[2026-11-21 Snap data directories 3](../../study-results/Snap/2026-11-21%20Snap%20data%20directories%203.md)'
  - '[2026-11-21 Snap data directories 4](../../study-results/Snap/2026-11-21%20Snap%20data%20directories%204.md)'
  - '[2026-11-21 Snap data directories 5](../../study-results/Snap/2026-11-21%20Snap%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The data-locations page names /var/lib/snapd/snaps, cache and snapshots; revision-specific
    data lives under /var/snap and ~/snap. Old revisions should be removed with snap remove --revision,
    never by deleting files.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Snap](../../stores/Snap.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The data-locations page names /var/lib/snapd/snaps, cache and snapshots; revision-specific data lives under /var/snap and ~/snap. Old revisions should be removed with snap remove --revision, never by deleting files.
