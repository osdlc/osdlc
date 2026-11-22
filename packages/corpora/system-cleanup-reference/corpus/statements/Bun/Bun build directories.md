---
proposition:
  subject: '[Bun](../../stores/Bun.md)'
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
  - '[2026-11-21 Bun build directories 1](../../study-results/Bun/2026-11-21%20Bun%20build%20directories%201.md)'
  - '[2026-11-21 Bun build directories 2](../../study-results/Bun/2026-11-21%20Bun%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Bun installs into the project's node_modules; bun.lock (alongside package.json) marks the
    project.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bun](../../stores/Bun.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Bun installs into the project's node_modules; bun.lock (alongside package.json) marks the project.
