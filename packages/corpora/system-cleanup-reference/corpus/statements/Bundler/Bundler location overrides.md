---
proposition:
  subject: '[Bundler](../../stores/Bundler.md)'
  predicate: location/override
  object:
    vars:
    - BUNDLE_USER_HOME
    - BUNDLE_USER_CACHE
    - BUNDLE_PATH
    - BUNDLE_CACHE_PATH
    - BUNDLE_GLOBAL_GEM_CACHE
    settings:
    - path
    - cache_path
    - global_gem_cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bundler location overrides 1](../../study-results/Bundler/2026-11-21%20Bundler%20location%20overrides%201.md)'
  - '[2026-11-21 Bundler location overrides 2](../../study-results/Bundler/2026-11-21%20Bundler%20location%20overrides%202.md)'
  - '[2026-11-21 Bundler location overrides 3](../../study-results/Bundler/2026-11-21%20Bundler%20location%20overrides%203.md)'
  - '[2026-11-21 Bundler location overrides 4](../../study-results/Bundler/2026-11-21%20Bundler%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: bundle config lists each setting with its BUNDLE_* variable and documents the user home
    and cache variables.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bundler](../../stores/Bundler.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

bundle config lists each setting with its BUNDLE_* variable and documents the user home and cache variables.
