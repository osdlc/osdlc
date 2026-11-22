---
proposition:
  subject: '[Bun](../../stores/Bun.md)'
  predicate: location/override
  object:
    vars:
    - BUN_INSTALL_CACHE_DIR
    settings:
    - install.cache.dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bun location overrides 1](../../study-results/Bun/2026-11-21%20Bun%20location%20overrides%201.md)'
  - '[2026-11-21 Bun location overrides 2](../../study-results/Bun/2026-11-21%20Bun%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The env var is named in prose; the bunfig.toml [install.cache] dir key is shown in the
    config example.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bun](../../stores/Bun.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The env var is named in prose; the bunfig.toml [install.cache] dir key is shown in the config example.
