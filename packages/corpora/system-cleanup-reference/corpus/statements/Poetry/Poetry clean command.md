---
proposition:
  subject: '[Poetry](../../stores/Poetry.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: poetry cache clear --all
      removes: cached packages from all repositories
    - command: poetry cache clear PyPI --all
      removes: cached packages from one repository
    - command: poetry env remove --all
      removes: all virtual environments of the current project
    - command: poetry python remove <version>
      removes: a Poetry-managed Python version
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Poetry clean command 1](../../study-results/Poetry/2026-11-21%20Poetry%20clean%20command%201.md)'
  - '[2026-11-21 Poetry clean command 2](../../study-results/Poetry/2026-11-21%20Poetry%20clean%20command%202.md)'
  - '[2026-11-21 Poetry clean command 3](../../study-results/Poetry/2026-11-21%20Poetry%20clean%20command%203.md)'
  - '[2026-11-21 Poetry clean command 4](../../study-results/Poetry/2026-11-21%20Poetry%20clean%20command%204.md)'
  - '[2026-11-21 Poetry clean command 5](../../study-results/Poetry/2026-11-21%20Poetry%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI doc documents cache clear, env remove and python remove.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Poetry](../../stores/Poetry.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI doc documents cache clear, env remove and python remove.
