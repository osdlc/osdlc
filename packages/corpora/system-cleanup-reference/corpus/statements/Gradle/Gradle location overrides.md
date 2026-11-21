---
proposition:
  subject: '[Gradle](../../stores/Gradle.md)'
  predicate: location/override
  object:
    vars:
    - GRADLE_USER_HOME
    settings:
    - layout.buildDirectory
    - init.d cache-settings (caches { ... })
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Gradle location overrides 1](../../study-results/Gradle/2026-11-21%20Gradle%20location%20overrides%201.md)'
  - '[2026-11-21 Gradle location overrides 2](../../study-results/Gradle/2026-11-21%20Gradle%20location%20overrides%202.md)'
  - '[2026-11-21 Gradle location overrides 3](../../study-results/Gradle/2026-11-21%20Gradle%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: GRADLE_USER_HOME moves all user-home caches; layout.buildDirectory sets the project build
    dir; retention is set in an init.d script.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Gradle](../../stores/Gradle.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

GRADLE_USER_HOME moves all user-home caches; layout.buildDirectory sets the project build dir; retention is set in an init.d script.
