---
proposition:
  subject: '[Poetry](../../stores/Poetry.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: poetry cache list
      shows: available caches
    - command: poetry env list --full-path
      shows: virtualenvs of the current project with paths
    - command: poetry python list --managed
      shows: Poetry-managed Python versions
    - command: poetry env info --path
      shows: where the current project's virtualenv is
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Poetry inventory command 1](../../study-results/Poetry/2026-11-21%20Poetry%20inventory%20command%201.md)'
  - '[2026-11-21 Poetry inventory command 2](../../study-results/Poetry/2026-11-21%20Poetry%20inventory%20command%202.md)'
  - '[2026-11-21 Poetry inventory command 3](../../study-results/Poetry/2026-11-21%20Poetry%20inventory%20command%203.md)'
  - '[2026-11-21 Poetry inventory command 4](../../study-results/Poetry/2026-11-21%20Poetry%20inventory%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI doc documents cache list, env list and python list; the configuration doc mentions
    env info --path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Poetry](../../stores/Poetry.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Poetry command reports cache sizes.
---

The CLI doc documents cache list, env list and python list; the configuration doc mentions env info --path.
