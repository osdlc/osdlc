---
proposition:
  subject: '[Flutter](../../stores/Flutter.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: flutter clean
      removes: the project's build and .dart_tool directories and platform ephemeral files
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flutter clean command 1](../../study-results/Flutter/2026-11-21%20Flutter%20clean%20command%201.md)'
  - '[2026-11-21 Flutter clean command 2](../../study-results/Flutter/2026-11-21%20Flutter%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI reference and the clean command source both describe flutter clean; no documented
    command prunes bin/cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flutter](../../stores/Flutter.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented command reclaims space in $FLUTTER_ROOT/bin/cache.
---

The CLI reference and the clean command source both describe flutter clean; no documented command prunes bin/cache.
