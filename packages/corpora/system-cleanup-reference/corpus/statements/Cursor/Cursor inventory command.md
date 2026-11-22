---
proposition:
  subject: '[Cursor](../../stores/Cursor.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: 'Agents Window: Settings → Worktrees → Cleanup'
      shows: every Cursor-managed worktree on the machine, grouped by source repository
    - command: 'Command Palette: Show Running Extensions'
      shows: loaded extensions with CPU and memory use
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cursor inventory command 1](../../study-results/Cursor/2026-11-21%20Cursor%20inventory%20command%201.md)'
  - '[2026-11-21 Cursor inventory command 2](../../study-results/Cursor/2026-11-21%20Cursor%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Cursor's help says the worktree cleanup page lists every managed worktree.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cursor](../../stores/Cursor.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Neither view reports disk sizes.
---

Cursor's help says the worktree cleanup page lists every managed worktree.
