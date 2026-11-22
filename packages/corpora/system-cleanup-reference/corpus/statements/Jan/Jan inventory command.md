---
proposition:
  subject: '[Jan](../../stores/Jan.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: jan models list
      shows: all models installed in the Jan data folder
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Jan inventory command 1](../../study-results/Jan/2026-11-21%20Jan%20inventory%20command%201.md)'
  - '[2026-11-21 Jan inventory command 2](../../study-results/Jan/2026-11-21%20Jan%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI reference documents `jan models list` (Jan 0.7.8 and later).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Jan](../../stores/Jan.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether `jan models list` shows sizes is not documented; the app's Delete All dialog shows total space.
---

The CLI reference documents `jan models list` (Jan 0.7.8 and later).
