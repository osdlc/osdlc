---
proposition:
  subject: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: swift package clean
      removes: build artifacts in the package's scratch directory
    - command: swift package reset
      removes: the package's complete cache/build directory
    - command: swift package purge-cache
      removes: the global repository cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Swift Package Manager clean command 1](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20clean%20command%201.md)'
  - '[2026-11-21 Swift Package Manager clean command 2](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20clean%20command%202.md)'
  - '[2026-11-21 Swift Package Manager clean command 3](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Each command's reference page states what it deletes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Each command's reference page states what it deletes.
