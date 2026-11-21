---
proposition:
  subject: '[RubyGems](../../stores/RubyGems.md)'
  predicate: location/override
  object:
    vars:
    - GEM_HOME
    - GEM_PATH
    - GEM_SPEC_CACHE
    settings:
    - --install-dir
    - --user-install
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 RubyGems location overrides 1](../../study-results/RubyGems/2026-11-21%20RubyGems%20location%20overrides%201.md)'
  - '[2026-11-21 RubyGems location overrides 2](../../study-results/RubyGems/2026-11-21%20RubyGems%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The environment-variables page lists GEM_HOME, GEM_PATH and GEM_SPEC_CACHE, and the command
    reference documents --user-install and --install-dir.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[RubyGems](../../stores/RubyGems.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The environment-variables page lists GEM_HOME, GEM_PATH and GEM_SPEC_CACHE, and the command reference documents --user-install and --install-dir.
