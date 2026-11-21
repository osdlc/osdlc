---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.conan2/p
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan data directories 1](../../study-results/Conan/2026-11-21%20Conan%20data%20directories%201.md)'
  - '[2026-11-21 Conan data directories 2](../../study-results/Conan/2026-11-21%20Conan%20data%20directories%202.md)'
  - '[2026-11-21 Conan data directories 3](../../study-results/Conan/2026-11-21%20Conan%20data%20directories%203.md)'
  - '[2026-11-21 Conan data directories 4](../../study-results/Conan/2026-11-21%20Conan%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Conan's source defaults the home to ~/.conan2 and its package storage to the p subfolder
    unless core.cache:storage_path is set.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The package cache mixes rebuildable build folders with downloaded or locally built binaries; packages
  built locally with --build must be rebuilt rather than re-downloaded.
---

Conan's source defaults the home to ~/.conan2 and its package storage to the p subfolder unless core.cache:storage_path is set.
