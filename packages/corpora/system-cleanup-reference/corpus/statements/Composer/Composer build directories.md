---
proposition:
  subject: '[Composer](../../stores/Composer.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: vendor
      marker: composer.json
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Composer build directories 1](../../study-results/Composer/2026-11-21%20Composer%20build%20directories%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The config docs give vendor as the default install directory for a project's dependencies.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Composer](../../stores/Composer.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The config docs give vendor as the default install directory for a project's dependencies.
