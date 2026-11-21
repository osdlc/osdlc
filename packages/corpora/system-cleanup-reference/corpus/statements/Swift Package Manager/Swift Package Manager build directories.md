---
proposition:
  subject: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .build
      marker: Package.swift
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Swift Package Manager build directories 1](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20build%20directories%201.md)'
  - '[2026-11-21 Swift Package Manager build directories 2](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20build%20directories%202.md)'
  - '[2026-11-21 Swift Package Manager build directories 3](../../study-results/Swift%20Package%20Manager/2026-11-21%20Swift%20Package%20Manager%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The getting-started guide says dependency checkouts and intermediate build products live
    in .build at the package root, and the clean reference gives .build as the default scratch path; a
    package is marked by Package.swift.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Swift Package Manager](../../stores/Swift%20Package%20Manager.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- .build also holds re-downloadable dependency checkouts (.build/checkouts), so deleting it costs both
  a re-download and a rebuild.
---

The getting-started guide says dependency checkouts and intermediate build products live in .build at the package root, and the clean reference gives .build as the default scratch path; a package is marked by Package.swift.
