---
proposition:
  subject: '[Coursier](../../stores/Coursier.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: cs list
      shows: installed applications and their versions
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Coursier inventory command 1](../../study-results/Coursier/2026-11-21%20Coursier%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The install docs show cs list for installed apps; nothing lists cache contents or sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Coursier](../../stores/Coursier.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command found that lists the artifact cache or managed JVMs with sizes.
---

The install docs show cs list for installed apps; nothing lists cache contents or sizes.
