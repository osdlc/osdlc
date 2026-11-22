---
proposition:
  subject: '[Mix](../../stores/Mix.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: mix deps
      shows: the project's dependencies and their status
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Mix inventory command 1](../../study-results/Mix/2026-11-21%20Mix%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The mix deps task lists dependencies and their status.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Mix](../../stores/Mix.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented command reports sizes of _build, deps or ~/.mix.
---

The mix deps task lists dependencies and their status.
