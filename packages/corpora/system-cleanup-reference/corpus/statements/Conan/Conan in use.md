---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: liveness/in-use
  object:
    processes:
    - conan
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan in use 1](../../study-results/Conan/2026-11-21%20Conan%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docs warn the package cache is not concurrent, so a cleaner should not run while a
    conan process uses the same home.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source names a lock file for the Conan 2 cache; the process name conan is inferred from the CLI name.
---

The docs warn the package cache is not concurrent, so a cleaner should not run while a conan process uses the same home.
