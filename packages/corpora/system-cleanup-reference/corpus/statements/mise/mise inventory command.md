---
proposition:
  subject: '[mise](../../stores/mise.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: mise ls --installed
      shows: installed tool versions
    - command: mise ls --prunable
      shows: versions mise prune would delete
    - command: mise cache path
      shows: the cache directory in use
    - command: mise doctor
      shows: the resolved data, config, cache, state and shims directories
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 mise inventory command 1](../../study-results/mise/2026-11-21%20mise%20inventory%20command%201.md)'
  - '[2026-11-21 mise inventory command 2](../../study-results/mise/2026-11-21%20mise%20inventory%20command%202.md)'
  - '[2026-11-21 mise inventory command 3](../../study-results/mise/2026-11-21%20mise%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The ls, prune and Directories pages name these commands; none of them reports sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[mise](../../stores/mise.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented mise command reports disk sizes.
---

The ls, prune and Directories pages name these commands; none of them reports sizes.
