---
proposition:
  subject: '[Deno](../../stores/Deno.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: deno info
      shows: the DENO_DIR location and its remote-module and TypeScript caches
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Deno inventory command 1](../../study-results/Deno/2026-11-21%20Deno%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: deno info with no arguments prints cache paths, not sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Deno](../../stores/Deno.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command reports cache size.
---

deno info with no arguments prints cache paths, not sizes.
