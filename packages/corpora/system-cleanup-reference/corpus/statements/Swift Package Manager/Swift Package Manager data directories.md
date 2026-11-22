---
proposition:
  subject: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Caches/org.swift.swiftpm
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Swift Package Manager data directories 1](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20data%20directories%201.md)'
  - '[2026-11-21 Swift Package Manager data directories 2](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20data%20directories%202.md)'
  - '[2026-11-21 Swift Package Manager data directories 3](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20data%20directories%203.md)'
  - '[2026-11-21 Swift Package Manager data directories 4](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: SwiftPM's own docs name the macOS shared cache path and tell users to remove it; the source
    appends org.swift.swiftpm to the user caches directory and falls back to ~/.swiftpm/cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform:
  - macos
status: current
open:
- No source spells out the Linux or Windows path of the user caches directory that SwiftPM appends org.swift.swiftpm
  to.
- The build-cache (compilation caching) location is only described as a subdirectory of SwiftPM's configuration
  directory; no exact path is given.
---

SwiftPM's own docs name the macOS shared cache path and tell users to remove it; the source appends org.swift.swiftpm to the user caches directory and falls back to ~/.swiftpm/cache.
