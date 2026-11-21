---
proposition:
  subject: '[Android SDK](../../stores/Android%20SDK.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: app/build
      marker: build.gradle.kts
      holds: build-output
      rebuild: rebuild
    - path: app/.cxx
      marker: build.gradle.kts
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android SDK build directories 1](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20build%20directories%201.md)'
  - '[2026-11-21 Android SDK build directories 2](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20build%20directories%202.md)'
  - '[2026-11-21 Android SDK build directories 3](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Android docs name each module's build/ output directory, the default module name app, and
    the module-level .cxx/ staging directory used by CMake external native builds.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android SDK](../../stores/Android%20SDK.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The quotes do not name the marker file; build.gradle.kts (or build.gradle) is the module build file
  Gradle uses.
- ndk-build projects may put .cxx at the project root instead; .cxx also holds files meant to survive
  clean builds, though it can be regenerated.
---

Android docs name each module's build/ output directory, the default module name app, and the module-level .cxx/ staging directory used by CMake external native builds.
