---
proposition:
  subject: '[pip](../../stores/pip.md)'
  predicate: location/override
  object:
    vars:
    - PIP_CACHE_DIR
    - XDG_CACHE_HOME
    settings:
    - cache-dir
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pip location overrides 1](../../study-results/pip/2026-11-21%20pip%20location%20overrides%201.md)'
  - '[2026-11-21 pip location overrides 2](../../study-results/pip/2026-11-21%20pip%20location%20overrides%202.md)'
  - '[2026-11-21 pip location overrides 3](../../study-results/pip/2026-11-21%20pip%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The pip CLI reference documents --cache-dir with its PIP_CACHE_DIR variable, and config-file
    keys map to long option names.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pip](../../stores/pip.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The pip CLI reference documents --cache-dir with its PIP_CACHE_DIR variable, and config-file keys map to long option names.
