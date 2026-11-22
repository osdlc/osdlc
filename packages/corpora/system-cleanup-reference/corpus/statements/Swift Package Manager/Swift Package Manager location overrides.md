---
proposition:
  subject: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
  predicate: location/override
  object:
    vars:
    - XDG_CONFIG_HOME
    settings:
    - --cache-path
    - --scratch-path
    - swift package build-cache configure --path
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Swift Package Manager location overrides 1](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20location%20overrides%201.md)'
  - '[2026-11-21 Swift Package Manager location overrides 2](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20location%20overrides%202.md)'
  - '[2026-11-21 Swift Package Manager location overrides 3](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20location%20overrides%203.md)'
  - '[2026-11-21 Swift Package Manager location overrides 4](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The command reference documents --cache-path and --scratch-path; the source moves ~/.swiftpm
    under $XDG_CONFIG_HOME/swiftpm when that variable is set; the build-caching doc documents a configurable
    cache path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The command reference documents --cache-path and --scratch-path; the source moves ~/.swiftpm under $XDG_CONFIG_HOME/swiftpm when that variable is set; the build-caching doc documents a configurable cache path.
