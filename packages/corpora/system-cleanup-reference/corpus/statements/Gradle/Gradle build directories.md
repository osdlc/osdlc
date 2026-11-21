---
proposition:
  subject: '[Gradle](../../stores/Gradle.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: build
      marker: settings.gradle.kts
      holds: build-output
      rebuild: rebuild
    - path: .gradle
      marker: settings.gradle.kts
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Gradle build directories 1](../../study-results/Gradle/2026-11-21%20Gradle%20build%20directories%201.md)'
  - '[2026-11-21 Gradle build directories 2](../../study-results/Gradle/2026-11-21%20Gradle%20build%20directories%202.md)'
  - '[2026-11-21 Gradle build directories 3](../../study-results/Gradle/2026-11-21%20Gradle%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The directory-layout page names .gradle and build in the project root and the settings
    file that defines the build.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Gradle](../../stores/Gradle.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Groovy builds use settings.gradle / build.gradle instead of the .kts names; each subproject also has
  its own build directory.
---

The directory-layout page names .gradle and build in the project root and the settings file that defines the build.
