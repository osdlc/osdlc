---
proposition:
  subject: '[NuGet](../../stores/NuGet.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.nuget/packages
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.nuget/packages
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%userprofile%\.nuget\packages'
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/.local/share/NuGet/v3-cache
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/NuGet/v3-cache
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%localappdata%\NuGet\v3-cache'
      holds: cache
      rebuild: re-download
    - platform: macos
      path: $TMPDIR/NuGetScratch
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: /tmp/NuGetScratch<username>
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%temp%\NuGetScratch'
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/.local/share/NuGet/plugins-cache
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: ~/.local/share/NuGet/plugins-cache
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%localappdata%\NuGet\plugins-cache'
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NuGet data directories 1](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%201.md)'
  - '[2026-11-21 NuGet data directories 2](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%202.md)'
  - '[2026-11-21 NuGet data directories 3](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%203.md)'
  - '[2026-11-21 NuGet data directories 4](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%204.md)'
  - '[2026-11-21 NuGet data directories 5](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%205.md)'
  - '[2026-11-21 NuGet data directories 6](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%206.md)'
  - '[2026-11-21 NuGet data directories 7](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%207.md)'
  - '[2026-11-21 NuGet data directories 8](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%208.md)'
  - '[2026-11-21 NuGet data directories 9](../../study-results/NuGet/2026-11-21%20NuGet%20data%20directories%209.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The NuGet docs table lists each local folder per platform, and the cleaning section says
    cleared packages are re-downloaded on the next restore.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NuGet](../../stores/NuGet.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The NuGet docs table lists each local folder per platform, and the cleaning section says cleared packages are re-downloaded on the next restore.
