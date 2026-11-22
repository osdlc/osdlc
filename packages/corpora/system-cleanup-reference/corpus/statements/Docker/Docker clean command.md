---
proposition:
  subject: '[Docker](../../stores/Docker.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: docker system prune
      removes: stopped containers, unused networks, dangling images and unused build cache
    - command: docker system prune -a
      removes: also all unused images, not just dangling ones
    - command: docker system prune --volumes
      removes: 'also anonymous volumes (user data: lost)'
    - command: docker builder prune
      removes: build cache only
    - command: docker volume prune
      removes: 'anonymous local volumes not used by a container (user data: lost); --all includes unused
        named volumes'
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Docker clean command 1](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%201.md)'
  - '[2026-11-21 Docker clean command 2](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%202.md)'
  - '[2026-11-21 Docker clean command 3](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%203.md)'
  - '[2026-11-21 Docker clean command 4](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%204.md)'
  - '[2026-11-21 Docker clean command 5](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%205.md)'
  - '[2026-11-21 Docker clean command 6](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%206.md)'
  - '[2026-11-21 Docker clean command 7](../../study-results/Docker/2026-11-21%20Docker%20clean%20command%207.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Docker's CLI reference and pruning guide document each prune command and warn that volumes
    are never removed automatically because that could destroy data.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Docker](../../stores/Docker.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Docker's CLI reference and pruning guide document each prune command and warn that volumes are never removed automatically because that could destroy data.
