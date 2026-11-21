---
proposition:
  subject: '[Mix](../../stores/Mix.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: _build
      marker: mix.exs
      holds: build-output
      rebuild: rebuild
    - path: deps
      marker: mix.exs
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Mix build directories 1](../../study-results/Mix/2026-11-21%20Mix%20build%20directories%201.md)'
  - '[2026-11-21 Mix build directories 2](../../study-results/Mix/2026-11-21%20Mix%20build%20directories%202.md)'
  - '[2026-11-21 Mix build directories 3](../../study-results/Mix/2026-11-21%20Mix%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Mix.Project gives _build as the default build path and deps as the default deps path, both
    relative to the project defined by mix.exs.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Mix](../../stores/Mix.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Path and in-umbrella dependencies live outside deps and must not be deleted; only deps itself is safe
  to remove.
---

Mix.Project gives _build as the default build path and deps as the default deps path, both relative to the project defined by mix.exs.
