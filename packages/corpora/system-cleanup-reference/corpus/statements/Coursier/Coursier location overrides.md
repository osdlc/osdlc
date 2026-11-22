---
proposition:
  subject: '[Coursier](../../stores/Coursier.md)'
  predicate: location/override
  object:
    vars:
    - COURSIER_CACHE
    - COURSIER_JVM_CACHE
    - COURSIER_BIN_DIR
    - COURSIER_INSTALL_DIR
    settings:
    - --cache
    - coursier.cache
    - coursier.jvm.cache
    - coursier.install.dir
    - --jvm-dir
    - --install-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Coursier location overrides 1](../../study-results/Coursier/2026-11-21%20Coursier%20location%20overrides%201.md)'
  - '[2026-11-21 Coursier location overrides 2](../../study-results/Coursier/2026-11-21%20Coursier%20location%20overrides%202.md)'
  - '[2026-11-21 Coursier location overrides 3](../../study-results/Coursier/2026-11-21%20Coursier%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Coursier docs name the variables, Java properties and CLI options that move the cache,
    the JVM cache and the install directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Coursier](../../stores/Coursier.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The Coursier docs name the variables, Java properties and CLI options that move the cache, the JVM cache and the install directory.
