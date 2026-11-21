---
proposition:
  subject: '[Docker](../../stores/Docker.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: docker system df
      shows: disk space used by images, containers, local volumes and build cache, with reclaimable amounts
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Docker inventory command 1](../../study-results/Docker/2026-11-21%20Docker%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docker system df reference says it reports the daemon's disk usage.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Docker](../../stores/Docker.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The docker system df reference says it reports the daemon's disk usage.
