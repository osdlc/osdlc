---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: location/override
  object:
    vars:
    - STACK_ROOT
    - STACK_XDG
    - STACK_WORK
    - XDG_DATA_HOME
    settings:
    - --stack-root
    - local-programs-path
    - work-dir
    - --work-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack location overrides 1](../../study-results/Stack/2026-11-21%20Stack%20location%20overrides%201.md)'
  - '[2026-11-21 Stack location overrides 2](../../study-results/Stack/2026-11-21%20Stack%20location%20overrides%202.md)'
  - '[2026-11-21 Stack location overrides 3](../../study-results/Stack/2026-11-21%20Stack%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The environment-variables page documents STACK_ROOT, STACK_WORK and STACK_XDG, and the
    Stack root topic names local-programs-path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The environment-variables page documents STACK_ROOT, STACK_WORK and STACK_XDG, and the Stack root topic names local-programs-path.
