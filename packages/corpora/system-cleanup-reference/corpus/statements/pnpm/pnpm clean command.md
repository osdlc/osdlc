---
proposition:
  subject: '[pnpm](../../stores/pnpm.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: pnpm store prune
      removes: packages no project on the system references, expired dlx cache entries and the package
        metadata cache
    - command: pnpm cache delete
      removes: cached registry metadata of the configured registry (all of it without arguments)
    - command: pnpm cache prune
      removes: metadata cache directories this pnpm version can no longer read (v12.5.0+, experimental)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pnpm clean command 1](../../study-results/pnpm/2026-11-21%20pnpm%20clean%20command%201.md)'
  - '[2026-11-21 pnpm clean command 2](../../study-results/pnpm/2026-11-21%20pnpm%20clean%20command%202.md)'
  - '[2026-11-21 pnpm clean command 3](../../study-results/pnpm/2026-11-21%20pnpm%20clean%20command%203.md)'
  - '[2026-11-21 pnpm clean command 4](../../study-results/pnpm/2026-11-21%20pnpm%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The store and cache command pages document these as the ways to reclaim space.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pnpm](../../stores/pnpm.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The store and cache command pages document these as the ways to reclaim space.
