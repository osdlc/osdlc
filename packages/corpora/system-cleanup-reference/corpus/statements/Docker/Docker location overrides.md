---
proposition:
  subject: '[Docker](../../stores/Docker.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - data-root
    - Disk image location
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Docker location overrides 1](../../study-results/Docker/2026-11-21%20Docker%20location%20overrides%201.md)'
  - '[2026-11-21 Docker location overrides 2](../../study-results/Docker/2026-11-21%20Docker%20location%20overrides%202.md)'
  - '[2026-11-21 Docker location overrides 3](../../study-results/Docker/2026-11-21%20Docker%20location%20overrides%203.md)'
  - '[2026-11-21 Docker location overrides 4](../../study-results/Docker/2026-11-21%20Docker%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The daemon's data-root option (daemon.json or --data-root) moves the Engine store; Docker
    Desktop's Advanced settings expose the disk image location; containerd's own config moves /var/lib/containerd.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Docker](../../stores/Docker.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No environment variable that moves the data-root is documented on the pages read.
---

The daemon's data-root option (daemon.json or --data-root) moves the Engine store; Docker Desktop's Advanced settings expose the disk image location; containerd's own config moves /var/lib/containerd.
