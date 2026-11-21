---
proposition:
  subject: '[vcpkg](../../stores/vcpkg.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: vcpkg_installed
      marker: vcpkg.json
      holds: packages
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 vcpkg build directories 1](../../study-results/vcpkg/2026-11-21%20vcpkg%20build%20directories%201.md)'
  - '[2026-11-21 vcpkg build directories 2](../../study-results/vcpkg/2026-11-21%20vcpkg%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The manifest-mode page says each manifest (vcpkg.json) gets a vcpkg_installed directory
    beside it; restoring it comes from the binary cache or a rebuild.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[vcpkg](../../stores/vcpkg.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The manifest-mode page says each manifest (vcpkg.json) gets a vcpkg_installed directory beside it; restoring it comes from the binary cache or a rebuild.
