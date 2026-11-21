---
proposition:
  subject: '[npm](../../stores/npm.md)'
  predicate: location/override
  object:
    vars:
    - npm_config_cache
    - npm_config_logs_dir
    settings:
    - cache
    - logs-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 npm location overrides 1](../../study-results/npm/2026-11-21%20npm%20location%20overrides%201.md)'
  - '[2026-11-21 npm location overrides 2](../../study-results/npm/2026-11-21%20npm%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The cache and logs-dir settings move the data, and any setting can be given as an npm_config_
    environment variable.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[npm](../../stores/npm.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The cache and logs-dir settings move the data, and any setting can be given as an npm_config_ environment variable.
