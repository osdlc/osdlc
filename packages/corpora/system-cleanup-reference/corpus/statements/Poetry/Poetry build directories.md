---
proposition:
  subject: '[Poetry](../../stores/Poetry.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .venv
      marker: pyproject.toml
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Poetry build directories 1](../../study-results/Poetry/2026-11-21%20Poetry%20build%20directories%201.md)'
  - '[2026-11-21 Poetry build directories 2](../../study-results/Poetry/2026-11-21%20Poetry%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: With virtualenvs.in-project set to true Poetry puts the environment in .venv at the project
    root, and pyproject.toml is the project file; with the default it uses an existing .venv if present.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Poetry](../../stores/Poetry.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Poetry also writes build output to dist on poetry build, but the quoted sources do not name that directory.
---

With virtualenvs.in-project set to true Poetry puts the environment in .venv at the project root, and pyproject.toml is the project file; with the default it uses an existing .venv if present.
