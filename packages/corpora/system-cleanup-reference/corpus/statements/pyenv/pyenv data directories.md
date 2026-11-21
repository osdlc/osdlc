---
proposition:
  subject: '[pyenv](../../stores/pyenv.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.pyenv/versions
      holds: toolchains
      rebuild: rebuild
    - platform: all
      path: ~/.pyenv/cache
      holds: downloads
      rebuild: re-download
    - platform: all
      path: ~/.pyenv/sources
      holds: build-output
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pyenv data directories 1](../../study-results/pyenv/2026-11-21%20pyenv%20data%20directories%201.md)'
  - '[2026-11-21 pyenv data directories 2](../../study-results/pyenv/2026-11-21%20pyenv%20data%20directories%202.md)'
  - '[2026-11-21 pyenv data directories 3](../../study-results/pyenv/2026-11-21%20pyenv%20data%20directories%203.md)'
  - '[2026-11-21 pyenv data directories 4](../../study-results/pyenv/2026-11-21%20pyenv%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The README says PYENV_ROOT defaults to ~/.pyenv and versions accumulate in $(pyenv root)/versions;
    the python-build README gives ~/.pyenv/cache (only used if created) and ~/.pyenv/sources (only with
    --keep).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pyenv](../../stores/pyenv.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Deleting a version also breaks virtualenvs and .python-version pins that use it until it is reinstalled
  (rebuilt from source).
---

The README says PYENV_ROOT defaults to ~/.pyenv and versions accumulate in $(pyenv root)/versions; the python-build README gives ~/.pyenv/cache (only used if created) and ~/.pyenv/sources (only with --keep).
