---
proposition:
  subject: '[Deno](../../stores/Deno.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: deno clean
      removes: the whole global module cache directory
    - command: deno clean --except main.ts
      removes: everything in the cache except what the given entry points need
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Deno clean command 1](../../study-results/Deno/2026-11-21%20Deno%20clean%20command%201.md)'
  - '[2026-11-21 Deno clean command 2](../../study-results/Deno/2026-11-21%20Deno%20clean%20command%202.md)'
  - '[2026-11-21 Deno clean command 3](../../study-results/Deno/2026-11-21%20Deno%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The deno clean reference documents both forms.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Deno](../../stores/Deno.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The deno clean reference documents both forms.
