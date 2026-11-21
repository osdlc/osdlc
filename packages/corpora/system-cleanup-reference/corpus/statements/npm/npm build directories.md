---
proposition:
  subject: '[npm](../../stores/npm.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: node_modules
      marker: package.json
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 npm build directories 1](../../study-results/npm/2026-11-21%20npm%20build%20directories%201.md)'
  - '[2026-11-21 npm build directories 2](../../study-results/npm/2026-11-21%20npm%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The folders doc names node_modules as the local install target and package.json as the
    package root marker.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[npm](../../stores/npm.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The folders doc names node_modules as the local install target and package.json as the package root marker.
