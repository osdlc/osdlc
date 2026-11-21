---
proposition:
  subject: '[pip](../../stores/pip.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: pip cache purge
      removes: all files from the wheel and HTTP caches
    - command: pip cache remove <pattern>
      removes: wheel files of matching packages (HTTP cache files are kept)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pip clean command 1](../../study-results/pip/2026-11-21%20pip%20clean%20command%201.md)'
  - '[2026-11-21 pip clean command 2](../../study-results/pip/2026-11-21%20pip%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching topic and the pip cache reference both document purge and remove.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pip](../../stores/pip.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The caching topic and the pip cache reference both document purge and remove.
