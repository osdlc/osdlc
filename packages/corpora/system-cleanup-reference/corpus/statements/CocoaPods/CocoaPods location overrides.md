---
proposition:
  subject: '[CocoaPods](../../stores/CocoaPods.md)'
  predicate: location/override
  object:
    vars:
    - CP_HOME_DIR
    - CP_CACHE_DIR
    - CP_REPOS_DIR
    settings:
    - cache_root
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 CocoaPods location overrides 1](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20location%20overrides%201.md)'
  - '[2026-11-21 CocoaPods location overrides 2](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20location%20overrides%202.md)'
  - '[2026-11-21 CocoaPods location overrides 3](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The configuration source reads CP_HOME_DIR, CP_CACHE_DIR and CP_REPOS_DIR, and cache_root
    can be set in ~/.cocoapods/config.yaml.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[CocoaPods](../../stores/CocoaPods.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The configuration source reads CP_HOME_DIR, CP_CACHE_DIR and CP_REPOS_DIR, and cache_root can be set in ~/.cocoapods/config.yaml.
