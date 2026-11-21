---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: target
      marker: build.sbt
      holds: build-output
      rebuild: rebuild
    - path: project/target
      marker: build.sbt
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt build directories 1](../../study-results/sbt/2026-11-21%20sbt%20build%20directories%201.md)'
  - '[2026-11-21 sbt build directories 2](../../study-results/sbt/2026-11-21%20sbt%20build%20directories%202.md)'
  - '[2026-11-21 sbt build directories 3](../../study-results/sbt/2026-11-21%20sbt%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The sbt directory-structure page says generated files go to target, and its .gitignore
    advice covers project/target as well; build.sbt marks the build.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The sbt directory-structure page says generated files go to target, and its .gitignore advice covers project/target as well; build.sbt marks the build.
