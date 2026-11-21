---
proposition:
  subject: '[Gradle](../../stores/Gradle.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.gradle/caches/modules-2
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.gradle/caches/build-cache-1
      holds: build-output
      rebuild: rebuild
    - platform: all
      path: ~/.gradle/caches/transforms-3
      holds: cache
      rebuild: rebuild
    - platform: all
      path: ~/.gradle/caches/jars-9
      holds: cache
      rebuild: rebuild
    - platform: all
      path: ~/.gradle/wrapper/dists
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.gradle/jdks
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.gradle/daemon
      holds: logs
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Gradle data directories 1](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%201.md)'
  - '[2026-11-21 Gradle data directories 2](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%202.md)'
  - '[2026-11-21 Gradle data directories 3](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%203.md)'
  - '[2026-11-21 Gradle data directories 4](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%204.md)'
  - '[2026-11-21 Gradle data directories 5](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%205.md)'
  - '[2026-11-21 Gradle data directories 6](../../study-results/Gradle/2026-11-21%20Gradle%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Gradle directory-layout page lists caches/, wrapper/dists, jdks and daemon under the
    Gradle User Home (~/.gradle) and names the shared cache subdirectories.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Gradle](../../stores/Gradle.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Windows default (C:\Users\<USERNAME>\.gradle) is on the same page but not quoted because of HTML
  escaping; the trailing format numbers (modules-2, transforms-3, jars-9) change between Gradle versions.
---

The Gradle directory-layout page lists caches/, wrapper/dists, jdks and daemon under the Gradle User Home (~/.gradle) and names the shared cache subdirectories.
