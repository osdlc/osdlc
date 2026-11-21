---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.sbt/boot
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.ivy2
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.cache/coursier/v1
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/Coursier/v1
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Coursier\Cache\v1'
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt data directories 1](../../study-results/sbt/2026-11-21%20sbt%20data%20directories%201.md)'
  - '[2026-11-21 sbt data directories 2](../../study-results/sbt/2026-11-21%20sbt%20data%20directories%202.md)'
  - '[2026-11-21 sbt data directories 3](../../study-results/sbt/2026-11-21%20sbt%20data%20directories%203.md)'
  - '[2026-11-21 sbt data directories 4](../../study-results/sbt/2026-11-21%20sbt%20data%20directories%204.md)'
  - '[2026-11-21 sbt data directories 5](../../study-results/sbt/2026-11-21%20sbt%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The sbt command-line reference gives the boot and Ivy directories; sbt 1.3+ resolves through
    Coursier, whose docs give its per-platform cache paths.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The ~/.ivy2 path is quoted only from a table cell of the sbt reference; the global base ~/.sbt/1.0 (settings
  and plugins) is user configuration and not listed as reclaimable.
- sbt 2.x layout was not researched.
---

The sbt command-line reference gives the boot and Ivy directories; sbt 1.3+ resolves through Coursier, whose docs give its per-platform cache paths.
