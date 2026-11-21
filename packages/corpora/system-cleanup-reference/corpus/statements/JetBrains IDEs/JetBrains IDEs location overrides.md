---
proposition:
  subject: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - idea.system.path
    - idea.log.path
    - idea.config.path
    - idea.plugins.path
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 JetBrains IDEs location overrides 1](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20location%20overrides%201.md)'
  - '[2026-11-21 JetBrains IDEs location overrides 2](../../study-results/JetBrains%20IDEs/2026-11-21%20JetBrains%20IDEs%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The directories page lists the idea.properties keys that move each directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[JetBrains IDEs](../../stores/JetBrains%20IDEs.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Environment variables that point the IDE at another idea.properties file are not covered by the pages
  read.
---

The directories page lists the idea.properties keys that move each directory.
