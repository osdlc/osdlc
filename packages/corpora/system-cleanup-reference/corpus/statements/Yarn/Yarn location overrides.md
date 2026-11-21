---
proposition:
  subject: '[Yarn](../../stores/Yarn.md)'
  predicate: location/override
  object:
    vars:
    - YARN_CACHE_FOLDER
    - YARN_GLOBAL_FOLDER
    - XDG_DATA_HOME
    - XDG_CACHE_HOME
    settings:
    - cacheFolder
    - globalFolder
    - enableGlobalCache
    - cache-folder
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Yarn location overrides 1](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%201.md)'
  - '[2026-11-21 Yarn location overrides 2](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%202.md)'
  - '[2026-11-21 Yarn location overrides 3](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%203.md)'
  - '[2026-11-21 Yarn location overrides 4](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%204.md)'
  - '[2026-11-21 Yarn location overrides 5](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%205.md)'
  - '[2026-11-21 Yarn location overrides 6](../../study-results/Yarn/2026-11-21%20Yarn%20location%20overrides%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Berry settings map to YARN_<SNAKE_CASE> env vars (YARN_GLOBAL_FOLDER follows that documented
    rule); XDG_DATA_HOME moves the Berry global folder on non-Windows; Classic uses cache-folder, YARN_CACHE_FOLDER
    and XDG_CACHE_HOME.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Yarn](../../stores/Yarn.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- YARN_GLOBAL_FOLDER is derived from the documented naming rule rather than quoted by name.
---

Berry settings map to YARN_<SNAKE_CASE> env vars (YARN_GLOBAL_FOLDER follows that documented rule); XDG_DATA_HOME moves the Berry global folder on non-Windows; Classic uses cache-folder, YARN_CACHE_FOLDER and XDG_CACHE_HOME.
