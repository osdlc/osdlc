---
proposition:
  subject: '[Apache Maven](../../stores/Apache%20Maven.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: target
      marker: pom.xml
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Apache Maven build directories 1](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20build%20directories%201.md)'
  - '[2026-11-21 Apache Maven build directories 2](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The POM reference sets the build directory default to ${project.basedir}/target; pom.xml
    is the project file the POM reference describes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The quotes do not name pom.xml explicitly as the marker file.
---

The POM reference sets the build directory default to ${project.basedir}/target; pom.xml is the project file the POM reference describes.
