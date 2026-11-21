---
proposition:
  subject: '[Cargo](../../stores/Cargo.md)'
  predicate: location/override
  object:
    vars:
    - CARGO_HOME
    - CARGO_TARGET_DIR
    - CARGO_CACHE_AUTO_CLEAN_FREQUENCY
    settings:
    - build.target-dir
    - cache.auto-clean-frequency
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cargo location overrides 1](../../study-results/Cargo/2026-11-21%20Cargo%20location%20overrides%201.md)'
  - '[2026-11-21 Cargo location overrides 2](../../study-results/Cargo/2026-11-21%20Cargo%20location%20overrides%202.md)'
  - '[2026-11-21 Cargo location overrides 3](../../study-results/Cargo/2026-11-21%20Cargo%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: CARGO_HOME moves the global caches; CARGO_TARGET_DIR / build.target-dir move build output;
    cache.auto-clean-frequency (env CARGO_CACHE_AUTO_CLEAN_FREQUENCY) controls automatic cleaning rather
    than location.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cargo](../../stores/Cargo.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

CARGO_HOME moves the global caches; CARGO_TARGET_DIR / build.target-dir move build output; cache.auto-clean-frequency (env CARGO_CACHE_AUTO_CLEAN_FREQUENCY) controls automatic cleaning rather than location.
