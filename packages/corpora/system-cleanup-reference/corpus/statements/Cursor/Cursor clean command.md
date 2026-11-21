---
proposition:
  subject: '[Cursor](../../stores/Cursor.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: 'Command Palette: Delete Old Chats…'
      removes: agent chat entries older than the chosen retention window
    - command: 'Command Palette: GC Agent KV Blobs'
      removes: freed space in the agent chat database (compacts the file)
    - command: 'Agents Window: Settings → Worktrees → Cleanup'
      removes: Cursor-managed worktrees beyond the count and size limits
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cursor clean command 1](../../study-results/Cursor/2026-11-21%20Cursor%20clean%20command%201.md)'
  - '[2026-11-21 Cursor clean command 2](../../study-results/Cursor/2026-11-21%20Cursor%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Cursor's help gives the two palette commands to run in order and the worktree cleanup controls.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cursor](../../stores/Cursor.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No command-line equivalent of these palette commands is documented.
---

Cursor's help gives the two palette commands to run in order and the worktree cleanup controls.
