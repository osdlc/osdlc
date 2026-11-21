---
proposition:
  subject: '[Bun](../../stores/Bun.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: bun pm cache
      shows: the path of the global module cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bun inventory command 1](../../study-results/Bun/2026-11-21%20Bun%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Only a path-printing command is documented; --dry-run on rm/prune lists what would be removed.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bun](../../stores/Bun.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command reports cache size.
---

Only a path-printing command is documented; --dry-run on rm/prune lists what would be removed.
