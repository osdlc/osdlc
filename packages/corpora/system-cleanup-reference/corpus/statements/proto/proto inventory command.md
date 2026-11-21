---
proposition:
  subject: '[proto](../../stores/proto.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: proto status
      shows: active tools, resolved versions and the config that defines them
    - command: proto versions
      shows: available versions of a tool, with installed ones marked by install date
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 proto inventory command 1](../../study-results/proto/2026-11-21%20proto%20inventory%20command%201.md)'
  - '[2026-11-21 proto inventory command 2](../../study-results/proto/2026-11-21%20proto%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The status and versions pages describe these listings; proto list was removed in v0.44.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[proto](../../stores/proto.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented proto command reports disk sizes.
---

The status and versions pages describe these listings; proto list was removed in v0.44.
