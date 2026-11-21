---
proposition:
  subject: '[Xcode](../../stores/Xcode.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: xcrun simctl list --json
      shows: all simulator devices, device types and runtimes
    - command: Xcode > Settings > Components
      shows: installed components and the storage each would recover
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Xcode inventory command 1](../../study-results/Xcode/2026-11-21%20Xcode%20inventory%20command%201.md)'
  - '[2026-11-21 Xcode inventory command 2](../../study-results/Xcode/2026-11-21%20Xcode%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Apple documents the Components pane showing recoverable storage; simctl list is attested
    by a third-party gist.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Xcode](../../stores/Xcode.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Apple documents the Components pane showing recoverable storage; simctl list is attested by a third-party gist.
