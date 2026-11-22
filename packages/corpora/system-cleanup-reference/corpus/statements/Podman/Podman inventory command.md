---
proposition:
  subject: '[Podman](../../stores/Podman.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: podman system df
      shows: disk usage for images, containers and volumes, with reclaimable sizes
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Podman inventory command 1](../../study-results/Podman/2026-11-21%20Podman%20inventory%20command%201.md)'
  - '[2026-11-21 Podman inventory command 2](../../study-results/Podman/2026-11-21%20Podman%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: podman-system-df(1) describes the command and warns its reclaimable figure for images can
    overstate what a prune frees.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Podman](../../stores/Podman.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

podman-system-df(1) describes the command and warns its reclaimable figure for images can overstate what a prune frees.
