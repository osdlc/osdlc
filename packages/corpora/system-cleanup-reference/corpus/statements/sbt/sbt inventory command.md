---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: sbt "show csrCacheDirectory"
      shows: the Coursier cache location sbt uses (no sizes)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt inventory command 1](../../study-results/sbt/2026-11-21%20sbt%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Coursier docs give an sbt command that prints the cache location; nothing lists contents
    or sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The Coursier docs give an sbt command that prints the cache location; nothing lists contents or sizes.
