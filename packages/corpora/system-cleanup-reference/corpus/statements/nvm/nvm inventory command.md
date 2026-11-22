---
proposition:
  subject: '[nvm](../../stores/nvm.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: nvm ls
      shows: installed Node.js versions
    - command: nvm cache dir
      shows: the path to the cache directory
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 nvm inventory command 1](../../study-results/nvm/2026-11-21%20nvm%20inventory%20command%201.md)'
  - '[2026-11-21 nvm inventory command 2](../../study-results/nvm/2026-11-21%20nvm%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: nvm's help text documents both commands; neither reports sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[nvm](../../stores/nvm.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

nvm's help text documents both commands; neither reports sizes.
