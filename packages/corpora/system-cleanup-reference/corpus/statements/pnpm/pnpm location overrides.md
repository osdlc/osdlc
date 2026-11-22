---
proposition:
  subject: '[pnpm](../../stores/pnpm.md)'
  predicate: location/override
  object:
    vars:
    - PNPM_HOME
    - XDG_DATA_HOME
    - XDG_CACHE_HOME
    - XDG_STATE_HOME
    settings:
    - storeDir
    - cacheDir
    - stateDir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pnpm location overrides 1](../../study-results/pnpm/2026-11-21%20pnpm%20location%20overrides%201.md)'
  - '[2026-11-21 pnpm location overrides 2](../../study-results/pnpm/2026-11-21%20pnpm%20location%20overrides%202.md)'
  - '[2026-11-21 pnpm location overrides 3](../../study-results/pnpm/2026-11-21%20pnpm%20location%20overrides%203.md)'
  - '[2026-11-21 pnpm location overrides 4](../../study-results/pnpm/2026-11-21%20pnpm%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Each setting's default is derived from these env vars, and the settings themselves set
    the path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pnpm](../../stores/pnpm.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Each setting's default is derived from these env vars, and the settings themselves set the path.
