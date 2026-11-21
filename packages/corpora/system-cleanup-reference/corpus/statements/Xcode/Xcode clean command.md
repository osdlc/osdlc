---
proposition:
  subject: '[Xcode](../../stores/Xcode.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: Xcode > Settings > Components > (i) > Delete
      removes: a simulator runtime or platform component you no longer use
    - command: xcrun simctl delete unavailable
      removes: simulator devices whose runtimes are no longer available
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Xcode clean command 1](../../study-results/Xcode/2026-11-21%20Xcode%20clean%20command%201.md)'
  - '[2026-11-21 Xcode clean command 2](../../study-results/Xcode/2026-11-21%20Xcode%20clean%20command%202.md)'
  - '[2026-11-21 Xcode clean command 3](../../study-results/Xcode/2026-11-21%20Xcode%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Apple documents deleting components in Xcode settings; `xcrun simctl delete unavailable`
    is attested only by third-party gists because simctl's help text is not published online.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Xcode](../../stores/Xcode.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- '`xcrun simctl runtime delete` and deleting DerivedData by command are not documented by any fetchable
  Apple page.'
- Apple's simctl help is available only on a Mac (`xcrun simctl help`), which this research could not
  run.
---

Apple documents deleting components in Xcode settings; `xcrun simctl delete unavailable` is attested only by third-party gists because simctl's help text is not published online.
