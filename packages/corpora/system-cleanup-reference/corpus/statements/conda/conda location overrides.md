---
proposition:
  subject: '[conda](../../stores/conda.md)'
  predicate: location/override
  object:
    vars:
    - CONDA_PKGS_DIRS
    - CONDA_ENVS_PATH
    - CONDA_ENVS_DIRS
    settings:
    - pkgs_dirs
    - envs_dirs
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 conda location overrides 1](../../study-results/conda/2026-11-21%20conda%20location%20overrides%201.md)'
  - '[2026-11-21 conda location overrides 2](../../study-results/conda/2026-11-21%20conda%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The settings page names the .condarc keys and the environment variables that overwrite
    them.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[conda](../../stores/conda.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The settings page names the .condarc keys and the environment variables that overwrite them.
