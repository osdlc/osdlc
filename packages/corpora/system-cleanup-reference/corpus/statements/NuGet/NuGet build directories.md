---
proposition:
  subject: '[NuGet](../../stores/NuGet.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: packages
      marker: packages.config
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NuGet build directories 1](../../study-results/NuGet/2026-11-21%20NuGet%20build%20directories%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The NuGet docs say packages.config projects get packages copied into a project-level packages
    folder; PackageReference projects use the global folder directly.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NuGet](../../stores/NuGet.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The NuGet docs say packages.config projects get packages copied into a project-level packages folder; PackageReference projects use the global folder directly.
