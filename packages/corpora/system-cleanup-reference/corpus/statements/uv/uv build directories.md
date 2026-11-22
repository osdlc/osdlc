---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .venv
      marker: pyproject.toml
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv build directories 1](../../study-results/uv/2026-11-21%20uv%20build%20directories%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The storage page says project environments are created in .venv next to pyproject.toml;
    uv re-creates them from the cache or the index on the next sync.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The storage page says project environments are created in .venv next to pyproject.toml; uv re-creates them from the cache or the index on the next sync.
