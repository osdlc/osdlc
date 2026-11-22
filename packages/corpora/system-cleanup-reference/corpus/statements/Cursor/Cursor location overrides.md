---
proposition:
  subject: '[Cursor](../../stores/Cursor.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - --user-data-dir
    - cursor.worktreeMaxCount
    - cursor.worktreesGlobalMaxSizeGb
    - cursor.worktreeCleanupIntervalHours
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cursor location overrides 1](../../study-results/Cursor/2026-11-21%20Cursor%20location%20overrides%201.md)'
  - '[2026-11-21 Cursor location overrides 2](../../study-results/Cursor/2026-11-21%20Cursor%20location%20overrides%202.md)'
  - '[2026-11-21 Cursor location overrides 3](../../study-results/Cursor/2026-11-21%20Cursor%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Cursor staff point to --user-data-dir for moving data; Cursor's help lists the worktree
    limit settings.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cursor](../../stores/Cursor.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether ~/.cursor can be moved separately (for example with --extensions-dir) is not settled by a Cursor
  doc.
---

Cursor staff point to --user-data-dir for moving data; Cursor's help lists the worktree limit settings.
