---
proposition:
  subject: '[Apache Maven](../../stores/Apache%20Maven.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - localRepository
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Apache Maven location overrides 1](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20location%20overrides%201.md)'
  - '[2026-11-21 Apache Maven location overrides 2](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The localRepository element in settings.xml moves the local repository.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The maven.repo.local system property is widely used to override the location but no quoted page here
  documents it.
---

The localRepository element in settings.xml moves the local repository.
