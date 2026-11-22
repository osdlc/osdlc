---
proposition:
  subject: '[LM Studio](../../stores/LM%20Studio.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: lms ls
      shows: all downloaded models with size, architecture and parameters, plus total disk use
    - command: lms ls --json
      shows: the same list as JSON
    - command: lms ps
      shows: models currently loaded in memory
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 LM Studio inventory command 1](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20inventory%20command%201.md)'
  - '[2026-11-21 LM Studio inventory command 2](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20inventory%20command%202.md)'
  - '[2026-11-21 LM Studio inventory command 3](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI docs describe lms ls (with sizes and a total) and lms ps.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[LM Studio](../../stores/LM%20Studio.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI docs describe lms ls (with sizes and a total) and lms ps.
