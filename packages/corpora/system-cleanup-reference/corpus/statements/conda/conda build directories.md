---
proposition:
  subject: '[conda](../../stores/conda.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: envs
      marker: environment.yml
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 conda build directories 1](../../study-results/conda/2026-11-21%20conda%20build%20directories%201.md)'
  - '[2026-11-21 conda build directories 2](../../study-results/conda/2026-11-21%20conda%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The environments guide shows a project-local environment created with --prefix ./envs,
    and the projects tutorial marks a conda project with environment.yml.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[conda](../../stores/conda.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The envs directory name is the docs' example, not a fixed convention; the prefix can be any path, and
  the two quotes come from different pages.
---

The environments guide shows a project-local environment created with --prefix ./envs, and the projects tutorial marks a conda project with environment.yml.
