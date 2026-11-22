---
proposition:
  subject: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: windows
      path: '%LOCALAPPDATA%\JetBrains\<product><version>'
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Caches/JetBrains/<product><version>
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: ~/.cache/JetBrains/<product><version>
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\JetBrains\<product><version>\log'
      holds: logs
      rebuild: lost
    - platform: macos
      path: ~/Library/Logs/JetBrains/<product><version>
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.cache/JetBrains/<product><version>/log
      holds: logs
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 JetBrains IDEs data directories 1](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%201.md)'
  - '[2026-11-21 JetBrains IDEs data directories 2](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%202.md)'
  - '[2026-11-21 JetBrains IDEs data directories 3](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%203.md)'
  - '[2026-11-21 JetBrains IDEs data directories 4](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%204.md)'
  - '[2026-11-21 JetBrains IDEs data directories 5](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%205.md)'
  - '[2026-11-21 JetBrains IDEs data directories 6](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%206.md)'
  - '[2026-11-21 JetBrains IDEs data directories 7](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%207.md)'
  - '[2026-11-21 JetBrains IDEs data directories 8](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20data%20directories%208.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The IntelliJ IDEA directories page gives the system (caches) and logs directories per platform,
    with examples such as IntelliJIdea2026.3; the system directory also holds Local History, which is
    lost if deleted.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The page is IntelliJ IDEA's; that every other JetBrains IDE uses the same layout with its own product
  name is assumed from the <product><version> pattern, not stated per IDE.
- Directories used by IDEs installed through the Toolbox App, other than plugins, are not covered.
---

The IntelliJ IDEA directories page gives the system (caches) and logs directories per platform, with examples such as IntelliJIdea2026.3; the system directory also holds Local History, which is lost if deleted.
