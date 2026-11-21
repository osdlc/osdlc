---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: location/override
  object:
    vars:
    - COURSIER_CACHE
    settings:
    - sbt.boot.directory
    - sbt.ivy.home
    - sbt.global.base
    - sbt.coursier.home
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt location overrides 1](../../study-results/sbt/2026-11-21%20sbt%20location%20overrides%201.md)'
  - '[2026-11-21 sbt location overrides 2](../../study-results/sbt/2026-11-21%20sbt%20location%20overrides%202.md)'
  - '[2026-11-21 sbt location overrides 3](../../study-results/sbt/2026-11-21%20sbt%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The sbt reference names the system properties for the boot and Ivy directories; the Coursier
    docs name the sbt property and environment variable for its cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The sbt reference names the system properties for the boot and Ivy directories; the Coursier docs name the sbt property and environment variable for its cache.
