---
proposition:
  subject: '[pnpm](../../stores/pnpm.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: pnpm store path
      shows: the path of the active store directory
    - command: pnpm cache list
      shows: packages in the metadata cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pnpm inventory command 1](../../study-results/pnpm/2026-11-21%20pnpm%20inventory%20command%201.md)'
  - '[2026-11-21 pnpm inventory command 2](../../study-results/pnpm/2026-11-21%20pnpm%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: pnpm store prune prints the size it removed, but no command is documented to report store
    size beforehand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pnpm](../../stores/pnpm.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command reports total store size.
---

pnpm store prune prints the size it removed, but no command is documented to report store size beforehand.
