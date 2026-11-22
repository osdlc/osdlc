---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: sbt clean
      removes: a project's generated files (the target directory)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt clean command 1](../../study-results/sbt/2026-11-21%20sbt%20clean%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: sbt's clean task removes per-project output only; the sbt docs describe no command that
    prunes ~/.sbt, ~/.ivy2 or the Coursier cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No sbt command for pruning the global boot, Ivy or Coursier caches was found.
---

sbt's clean task removes per-project output only; the sbt docs describe no command that prunes ~/.sbt, ~/.ivy2 or the Coursier cache.
