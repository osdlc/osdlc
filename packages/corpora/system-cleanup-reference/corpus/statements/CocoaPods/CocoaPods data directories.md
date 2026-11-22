---
proposition:
  subject: '[CocoaPods](../../stores/CocoaPods.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Caches/CocoaPods
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/.cocoapods/repos
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 CocoaPods data directories 1](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20data%20directories%201.md)'
  - '[2026-11-21 CocoaPods data directories 2](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20data%20directories%202.md)'
  - '[2026-11-21 CocoaPods data directories 3](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CocoaPods configuration source sets the cache root to ~/Library/Caches/CocoaPods and
    stores spec repos under the ~/.cocoapods home directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[CocoaPods](../../stores/CocoaPods.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform:
  - macos
status: current
---

The CocoaPods configuration source sets the cache root to ~/Library/Caches/CocoaPods and stores spec repos under the ~/.cocoapods home directory.
