---
proposition:
  subject: '[Docker](../../stores/Docker.md)'
  predicate: liveness/in-use
  object:
    processes:
    - dockerd
    locks:
    - /var/run/docker.pid
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Docker in use 1](../../study-results/Docker/2026-11-21%20Docker%20in%20use%201.md)'
  - '[2026-11-21 Docker in use 2](../../study-results/Docker/2026-11-21%20Docker%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dockerd reference names dockerd as the persistent daemon process and /var/run/docker.pid
    as its default PID file.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Docker](../../stores/Docker.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The process names of Docker Desktop's VM and backend on macOS and Windows are not given by the pages
  read.
---

The dockerd reference names dockerd as the persistent daemon process and /var/run/docker.pid as its default PID file.
