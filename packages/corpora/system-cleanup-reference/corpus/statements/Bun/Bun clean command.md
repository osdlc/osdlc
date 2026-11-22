---
proposition:
  subject: '[Bun](../../stores/Bun.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: bun pm cache rm
      removes: everything in the cache directory, including the global store
    - command: bun pm cache prune
      removes: cached packages older than 30 days (--max-age to change)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bun clean command 1](../../study-results/Bun/2026-11-21%20Bun%20clean%20command%201.md)'
  - '[2026-11-21 Bun clean command 2](../../study-results/Bun/2026-11-21%20Bun%20clean%20command%202.md)'
  - '[2026-11-21 Bun clean command 3](../../study-results/Bun/2026-11-21%20Bun%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The bun pm doc documents both commands; projects using globalStore must re-run bun install
    after cache rm.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bun](../../stores/Bun.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The bun pm doc documents both commands; projects using globalStore must re-run bun install after cache rm.
