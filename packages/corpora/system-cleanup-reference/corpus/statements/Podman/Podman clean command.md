---
proposition:
  subject: '[Podman](../../stores/Podman.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: podman system prune
      removes: unused containers, build containers, pods and networks
    - command: podman system prune --all
      removes: also all unused images
    - command: podman system prune --volumes
      removes: 'also unused volumes (user data: lost)'
    - command: podman system reset
      removes: 'everything: all pods, containers, images, networks, volumes and machines, plus graphRoot
        and runRoot'
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Podman clean command 1](../../study-results/Podman/2026-11-21%20Podman%20clean%20command%201.md)'
  - '[2026-11-21 Podman clean command 2](../../study-results/Podman/2026-11-21%20Podman%20clean%20command%202.md)'
  - '[2026-11-21 Podman clean command 3](../../study-results/Podman/2026-11-21%20Podman%20clean%20command%203.md)'
  - '[2026-11-21 Podman clean command 4](../../study-results/Podman/2026-11-21%20Podman%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The podman-system-prune and podman-system-reset man pages describe what each removes, and
    that volumes are kept unless --volumes is given.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Podman](../../stores/Podman.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The podman-system-prune and podman-system-reset man pages describe what each removes, and that volumes are kept unless --volumes is given.
