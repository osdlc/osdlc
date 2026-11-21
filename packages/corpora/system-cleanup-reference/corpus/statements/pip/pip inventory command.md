---
proposition:
  subject: '[pip](../../stores/pip.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: pip cache info
      shows: total size and location of the parts of the cache
    - command: pip cache list
      shows: wheel files in the cache
    - command: pip cache dir
      shows: the cache directory in use
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pip inventory command 1](../../study-results/pip/2026-11-21%20pip%20inventory%20command%201.md)'
  - '[2026-11-21 pip inventory command 2](../../study-results/pip/2026-11-21%20pip%20inventory%20command%202.md)'
  - '[2026-11-21 pip inventory command 3](../../study-results/pip/2026-11-21%20pip%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching topic describes info, list and dir.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pip](../../stores/pip.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The caching topic describes info, list and dir.
