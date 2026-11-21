---
proposition:
  subject: '[Gradle](../../stores/Gradle.md)'
  predicate: liveness/in-use
  object:
    processes:
    - GradleDaemon
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Gradle in use 1](../../study-results/Gradle/2026-11-21%20Gradle%20in%20use%201.md)'
  - '[2026-11-21 Gradle in use 2](../../study-results/Gradle/2026-11-21%20Gradle%20in%20use%202.md)'
  - '[2026-11-21 Gradle in use 3](../../study-results/Gradle/2026-11-21%20Gradle%20in%20use%203.md)'
  - '[2026-11-21 Gradle in use 4](../../study-results/Gradle/2026-11-21%20Gradle%20in%20use%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Running builds show up as GradleDaemon processes (jps, gradle --status; gradle --stop ends
    them); the dependency cache uses file-based locks whose file names the docs do not give.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Gradle](../../stores/Gradle.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The names of Gradle's cache lock files are not documented.
---

Running builds show up as GradleDaemon processes (jps, gradle --status; gradle --stop ends them); the dependency cache uses file-based locks whose file names the docs do not give.
