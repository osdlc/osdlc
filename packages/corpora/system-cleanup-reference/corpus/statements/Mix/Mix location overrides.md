---
proposition:
  subject: '[Mix](../../stores/Mix.md)'
  predicate: location/override
  object:
    vars:
    - MIX_HOME
    - MIX_XDG
    - MIX_ARCHIVES
    - MIX_INSTALL_DIR
    - MIX_BUILD_ROOT
    - MIX_BUILD_PATH
    - MIX_DEPS_PATH
    - MIX_REBAR3
    settings:
    - :build_path
    - :deps_path
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Mix location overrides 1](../../study-results/Mix/2026-11-21%20Mix%20location%20overrides%201.md)'
  - '[2026-11-21 Mix location overrides 2](../../study-results/Mix/2026-11-21%20Mix%20location%20overrides%202.md)'
  - '[2026-11-21 Mix location overrides 3](../../study-results/Mix/2026-11-21%20Mix%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Mix module docs list these environment variables and Mix.Project documents the :build_path
    and :deps_path options.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Mix](../../stores/Mix.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The Mix module docs list these environment variables and Mix.Project documents the :build_path and :deps_path options.
