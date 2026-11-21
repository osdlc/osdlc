---
proposition:
  subject: '[Homebrew](../../stores/Homebrew.md)'
  predicate: location/override
  object:
    vars:
    - HOMEBREW_CACHE
    - HOMEBREW_LOGS
    - HOMEBREW_CLEANUP_MAX_AGE_DAYS
    - HOMEBREW_NO_INSTALL_CLEANUP
    - HOMEBREW_NO_CLEANUP_FORMULAE
    - XDG_CACHE_HOME
    settings: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Homebrew location overrides 1](../../study-results/Homebrew/2026-11-21%20Homebrew%20location%20overrides%201.md)'
  - '[2026-11-21 Homebrew location overrides 2](../../study-results/Homebrew/2026-11-21%20Homebrew%20location%20overrides%202.md)'
  - '[2026-11-21 Homebrew location overrides 3](../../study-results/Homebrew/2026-11-21%20Homebrew%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: HOMEBREW_CACHE and HOMEBREW_LOGS move the data; the cleanup entry names HOMEBREW_CLEANUP_MAX_AGE_DAYS
    for the 120-day age, and the FAQ names HOMEBREW_NO_INSTALL_CLEANUP and HOMEBREW_NO_CLEANUP_FORMULAE
    to turn off automatic cleanup.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Homebrew](../../stores/Homebrew.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

HOMEBREW_CACHE and HOMEBREW_LOGS move the data; the cleanup entry names HOMEBREW_CLEANUP_MAX_AGE_DAYS for the 120-day age, and the FAQ names HOMEBREW_NO_INSTALL_CLEANUP and HOMEBREW_NO_CLEANUP_FORMULAE to turn off automatic cleanup.
