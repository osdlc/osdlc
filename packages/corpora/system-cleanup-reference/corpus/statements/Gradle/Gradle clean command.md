---
proposition:
  subject: '[Gradle](../../stores/Gradle.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: gradle clean
      removes: the project's build directory
    - command: (automatic, every 24 hours)
      removes: unused version-specific caches, shared cache entries, unused wrapper distributions and
        daemon logs older than 14 days in the Gradle User Home
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Gradle clean command 1](../../study-results/Gradle/2026-11-21%20Gradle%20clean%20command%201.md)'
  - '[2026-11-21 Gradle clean command 2](../../study-results/Gradle/2026-11-21%20Gradle%20clean%20command%202.md)'
  - '[2026-11-21 Gradle clean command 3](../../study-results/Gradle/2026-11-21%20Gradle%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Gradle has no command to prune the user home; it cleans it automatically, and the clean
    task deletes a project's build directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Gradle](../../stores/Gradle.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Gradle command clears the Gradle User Home caches on demand; the docs offer only automatic cleanup
  and its init-script configuration.
---

Gradle has no command to prune the user home; it cleans it automatically, and the clean task deletes a project's build directory.
