---
proposition:
  subject: '[Kotlin Native](../../stores/Kotlin%20Native.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.konan
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Kotlin Native data directories 1](../../study-results/Kotlin%20Native/2026-11-21%20Kotlin%20Native%20data%20directories%201.md)'
  - '[2026-11-21 Kotlin Native data directories 2](../../study-results/Kotlin%20Native/2026-11-21%20Kotlin%20Native%20data%20directories%202.md)'
  - '[2026-11-21 Kotlin Native data directories 3](../../study-results/Kotlin%20Native/2026-11-21%20Kotlin%20Native%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The Kotlin docs say Kotlin/Native downloads components and caches results in ~/.konan and
    recreates it when missing; the compiler's HACKING.md gives the same default.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Kotlin Native](../../stores/Kotlin%20Native.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The Kotlin docs say Kotlin/Native downloads components and caches results in ~/.konan and recreates it when missing; the compiler's HACKING.md gives the same default.
