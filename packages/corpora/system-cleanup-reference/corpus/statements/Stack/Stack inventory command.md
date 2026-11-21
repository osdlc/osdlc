---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: stack ls tools
      shows: Stack-installed tools such as GHC versions (and MSYS2 on Windows)
    - command: stack ls snapshots
      shows: local snapshots
    - command: stack path --stack-root
      shows: the Stack root location
    - command: stack path --programs
      shows: where tools such as GHC are installed
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack inventory command 1](../../study-results/Stack/2026-11-21%20Stack%20inventory%20command%201.md)'
  - '[2026-11-21 Stack inventory command 2](../../study-results/Stack/2026-11-21%20Stack%20inventory%20command%202.md)'
  - '[2026-11-21 Stack inventory command 3](../../study-results/Stack/2026-11-21%20Stack%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The ls command page and Stack root topic document these.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The ls command page and Stack root topic document these.
