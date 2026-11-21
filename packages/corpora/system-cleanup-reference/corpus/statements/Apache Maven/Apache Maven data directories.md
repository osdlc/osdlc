---
proposition:
  subject: '[Apache Maven](../../stores/Apache%20Maven.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.m2/repository
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Apache Maven data directories 1](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20data%20directories%201.md)'
  - '[2026-11-21 Apache Maven data directories 2](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20data%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The settings reference gives ${user.home}/.m2/repository as the default; the local-repository
    page says it mixes downloaded artifacts with locally installed ones.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Artifacts installed locally with mvn install (not downloaded) only come back by rebuilding the project
  that produced them.
---

The settings reference gives ${user.home}/.m2/repository as the default; the local-repository page says it mixes downloaded artifacts with locally installed ones.
