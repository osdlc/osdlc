---
proposition:
  subject: '[Visual Studio](../../stores/Visual%20Studio.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .vs
      marker: '*.sln'
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio build directories 1](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20build%20directories%201.md)'
  - '[2026-11-21 Visual Studio build directories 2](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20build%20directories%202.md)'
  - '[2026-11-21 Visual Studio build directories 3](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Microsoft Learn says the .vs subfolder holds cached browsing data and can be deleted after
    closing the folder, and that IntelliSense support files are placed next to the solution by default;
    a Q&A thread shows ipch caches inside .vs growing past 1 GB.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio](../../stores/Visual%20Studio.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform:
  - windows
status: current
open:
- The .vs folder also holds per-user solution state (such as open documents), which a cleaner would discard;
  no source lists all of its contents.
---

Microsoft Learn says the .vs subfolder holds cached browsing data and can be deleted after closing the folder, and that IntelliSense support files are placed next to the solution by default; a Q&A thread shows ipch caches inside .vs growing past 1 GB.
