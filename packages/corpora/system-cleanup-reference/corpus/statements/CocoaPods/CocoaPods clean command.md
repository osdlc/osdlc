---
proposition:
  subject: '[CocoaPods](../../stores/CocoaPods.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: pod cache clean --all
      removes: the whole pods download cache
    - command: pod cache clean NAME
      removes: cached copies of one pod
    - command: pod deintegrate
      removes: CocoaPods integration from an Xcode project
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 CocoaPods clean command 1](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20clean%20command%201.md)'
  - '[2026-11-21 CocoaPods clean command 2](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20clean%20command%202.md)'
  - '[2026-11-21 CocoaPods clean command 3](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The command reference describes pod cache clean, its --all flag, and pod deintegrate.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[CocoaPods](../../stores/CocoaPods.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The command reference describes pod cache clean, its --all flag, and pod deintegrate.
