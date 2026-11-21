---
proposition:
  subject: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: File | Invalidate Caches…
      removes: cache files for all projects of the current IDE version, on restart (Local History only
        if chosen)
    - command: Help | Delete Leftover IDE Directories…
      removes: directories of older IDE versions you select
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 JetBrains IDEs clean command 1](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20clean%20command%201.md)'
  - '[2026-11-21 JetBrains IDEs clean command 2](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20clean%20command%202.md)'
  - '[2026-11-21 JetBrains IDEs clean command 3](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20clean%20command%203.md)'
  - '[2026-11-21 JetBrains IDEs clean command 4](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: These are IDE menu actions, not shell commands; the docs also say a new major version deletes
    caches and logs of older versions not updated in 180 days.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command-line equivalent of these actions is documented.
---

These are IDE menu actions, not shell commands; the docs also say a new major version deletes caches and logs of older versions not updated in 180 days.
