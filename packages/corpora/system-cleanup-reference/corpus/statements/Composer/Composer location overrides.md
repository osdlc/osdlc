---
proposition:
  subject: '[Composer](../../stores/Composer.md)'
  predicate: location/override
  object:
    vars:
    - COMPOSER_CACHE_DIR
    - COMPOSER_HOME
    - COMPOSER_VENDOR_DIR
    settings:
    - cache-dir
    - cache-files-dir
    - cache-repo-dir
    - cache-vcs-dir
    - cache-files-maxsize
    - cache-files-ttl
    - vendor-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Composer location overrides 1](../../study-results/Composer/2026-11-21%20Composer%20location%20overrides%201.md)'
  - '[2026-11-21 Composer location overrides 2](../../study-results/Composer/2026-11-21%20Composer%20location%20overrides%202.md)'
  - '[2026-11-21 Composer location overrides 3](../../study-results/Composer/2026-11-21%20Composer%20location%20overrides%203.md)'
  - '[2026-11-21 Composer location overrides 4](../../study-results/Composer/2026-11-21%20Composer%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI docs list the environment variables and the config docs list the cache and vendor
    settings.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Composer](../../stores/Composer.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI docs list the environment variables and the config docs list the cache and vendor settings.
