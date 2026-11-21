---
proposition:
  subject: '[Cabal](../../stores/Cabal.md)'
  predicate: location/override
  object:
    vars:
    - CABAL_DIR
    - CABAL_CONFIG
    - CABAL_BUILDDIR
    - XDG_CACHE_HOME
    - XDG_STATE_HOME
    settings:
    - remote-repo-cache
    - --builddir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cabal location overrides 1](../../study-results/Cabal/2026-11-21%20Cabal%20location%20overrides%201.md)'
  - '[2026-11-21 Cabal location overrides 2](../../study-results/Cabal/2026-11-21%20Cabal%20location%20overrides%202.md)'
  - '[2026-11-21 Cabal location overrides 3](../../study-results/Cabal/2026-11-21%20Cabal%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The configuration docs document CABAL_DIR and remote-repo-cache, and the project file docs
    document --builddir.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cabal](../../stores/Cabal.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The configuration docs document CABAL_DIR and remote-repo-cache, and the project file docs document --builddir.
