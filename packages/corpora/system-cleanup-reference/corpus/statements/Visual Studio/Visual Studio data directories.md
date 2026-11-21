---
proposition:
  subject: '[Visual Studio](../../stores/Visual%20Studio.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: windows
      path: '%ProgramData%\Microsoft\VisualStudio\Packages'
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Microsoft\VisualStudio\<version>_<instance>\ComponentModelCache'
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\Microsoft\VisualStudio\Roslyn'
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio data directories 1](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20data%20directories%201.md)'
  - '[2026-11-21 Visual Studio data directories 2](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20data%20directories%202.md)'
  - '[2026-11-21 Visual Studio data directories 3](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20data%20directories%203.md)'
  - '[2026-11-21 Visual Studio data directories 4](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Microsoft's setup blog gives the package cache default and Microsoft Learn says the installer
    re-downloads packages when needed; the ComponentModelCache and Roslyn paths come only from a Microsoft
    Q&A answer, not product docs.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio](../../stores/Visual%20Studio.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform:
  - windows
status: current
open:
- No Microsoft product documentation gives the ComponentModelCache or Roslyn cache paths; they rest on
  a Q&A answer.
- Whether ComponentModelCache is rebuilt automatically on next start is not stated by a primary source.
---

Microsoft's setup blog gives the package cache default and Microsoft Learn says the installer re-downloads packages when needed; the ComponentModelCache and Roslyn paths come only from a Microsoft Q&A answer, not product docs.
