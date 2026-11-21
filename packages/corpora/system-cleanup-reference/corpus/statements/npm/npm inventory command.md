---
proposition:
  subject: '[npm](../../stores/npm.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: npm cache ls
      shows: given entries or all entries in the local cache (no sizes)
    - command: npm cache npx ls
      shows: all entries in the npx cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 npm inventory command 1](../../study-results/npm/2026-11-21%20npm%20inventory%20command%201.md)'
  - '[2026-11-21 npm inventory command 2](../../study-results/npm/2026-11-21%20npm%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: npm-cache documents ls subcommands; none of them is documented to report sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[npm](../../stores/npm.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No npm command reports cache size.
---

npm-cache documents ls subcommands; none of them is documented to report sizes.
