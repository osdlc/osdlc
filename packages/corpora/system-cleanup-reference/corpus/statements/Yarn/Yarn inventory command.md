---
proposition:
  subject: '[Yarn](../../stores/Yarn.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: yarn cache list
      shows: every cached package (Classic only)
    - command: yarn cache dir
      shows: the path of the global cache (Classic only)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Yarn inventory command 1](../../study-results/Yarn/2026-11-21%20Yarn%20inventory%20command%201.md)'
  - '[2026-11-21 Yarn inventory command 2](../../study-results/Yarn/2026-11-21%20Yarn%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Only Yarn Classic documents cache listing commands.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Yarn](../../stores/Yarn.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Yarn Berry documents no command that lists cache contents or sizes.
---

Only Yarn Classic documents cache listing commands.
