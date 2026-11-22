---
proposition:
  subject: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: code --list-extensions --show-versions
      shows: installed extensions and their versions (no sizes)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio Code inventory command 1](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20inventory%20command%201.md)'
  - '[2026-11-21 Visual Studio Code inventory command 2](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI docs describe --list-extensions and --show-versions.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI docs describe --list-extensions and --show-versions.
