---
proposition:
  subject: '[pacman](../../stores/pacman.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: paccache -d
      shows: candidate packages paccache would remove (dry run)
    - command: pacman -Qdt
      shows: orphan packages no longer required as dependencies
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pacman inventory command 1](../../study-results/pacman/2026-11-21%20pacman%20inventory%20command%201.md)'
  - '[2026-11-21 pacman inventory command 2](../../study-results/pacman/2026-11-21%20pacman%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: paccache -d previews cache removals and pacman -Qdt lists orphans.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pacman](../../stores/pacman.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

paccache -d previews cache removals and pacman -Qdt lists orphans.
