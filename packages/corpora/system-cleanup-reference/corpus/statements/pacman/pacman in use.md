---
proposition:
  subject: '[pacman](../../stores/pacman.md)'
  predicate: liveness/in-use
  object:
    processes:
    - pacman
    locks:
    - /var/lib/pacman/db.lck
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pacman in use 1](../../study-results/pacman/2026-11-21%20pacman%20in%20use%201.md)'
  - '[2026-11-21 pacman in use 2](../../study-results/pacman/2026-11-21%20pacman%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The ArchWiki names db.lck as pacman's lock; its presence means a transaction is running
    or was interrupted.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pacman](../../stores/pacman.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The ArchWiki names db.lck as pacman's lock; its presence means a transaction is running or was interrupted.
