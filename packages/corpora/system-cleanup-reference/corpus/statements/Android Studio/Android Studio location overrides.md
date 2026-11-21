---
proposition:
  subject: '[Android Studio](../../stores/Android%20Studio.md)'
  predicate: location/override
  object:
    vars:
    - STUDIO_PROPERTIES
    - STUDIO_VM_OPTIONS
    - GRADLE_USER_HOME
    settings:
    - idea.system.path
    - idea.config.path
    - idea.plugins.path
    - idea.log.path
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android Studio location overrides 1](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20location%20overrides%201.md)'
  - '[2026-11-21 Android Studio location overrides 2](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20location%20overrides%202.md)'
  - '[2026-11-21 Android Studio location overrides 3](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20location%20overrides%203.md)'
  - '[2026-11-21 Android Studio location overrides 4](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The configuration page shows setting idea.system.path in idea.properties, STUDIO_PROPERTIES
    pointing at another properties file, and GRADLE_USER_HOME moving the Gradle cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android Studio](../../stores/Android%20Studio.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The configuration page shows setting idea.system.path in idea.properties, STUDIO_PROPERTIES pointing at another properties file, and GRADLE_USER_HOME moving the Gradle cache.
