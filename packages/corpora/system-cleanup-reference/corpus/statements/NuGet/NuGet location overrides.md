---
proposition:
  subject: '[NuGet](../../stores/NuGet.md)'
  predicate: location/override
  object:
    vars:
    - NUGET_PACKAGES
    - NUGET_HTTP_CACHE_PATH
    - NUGET_SCRATCH
    - NUGET_PLUGINS_CACHE_PATH
    settings:
    - globalPackagesFolder
    - repositoryPath
    - RestorePackagesPath
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NuGet location overrides 1](../../study-results/NuGet/2026-11-21%20NuGet%20location%20overrides%201.md)'
  - '[2026-11-21 NuGet location overrides 2](../../study-results/NuGet/2026-11-21%20NuGet%20location%20overrides%202.md)'
  - '[2026-11-21 NuGet location overrides 3](../../study-results/NuGet/2026-11-21%20NuGet%20location%20overrides%203.md)'
  - '[2026-11-21 NuGet location overrides 4](../../study-results/NuGet/2026-11-21%20NuGet%20location%20overrides%204.md)'
  - '[2026-11-21 NuGet location overrides 5](../../study-results/NuGet/2026-11-21%20NuGet%20location%20overrides%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Each folder's row in the NuGet docs table names the environment variable that overrides
    it; the global-packages row also names the config settings and the MSBuild property.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NuGet](../../stores/NuGet.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Each folder's row in the NuGet docs table names the environment variable that overrides it; the global-packages row also names the config settings and the MSBuild property.
