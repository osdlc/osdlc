---
proposition:
  subject: '[Cursor](../../stores/Cursor.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.cursor/worktrees
      holds: build-output
      rebuild: lost
    - platform: all
      path: ~/.cursor/extensions
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%AppData%\Cursor'
      holds: state
      rebuild: lost
    - platform: macos
      path: ~/Library/Application Support/Cursor
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.config/Cursor
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cursor data directories 1](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%201.md)'
  - '[2026-11-21 Cursor data directories 2](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%202.md)'
  - '[2026-11-21 Cursor data directories 3](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%203.md)'
  - '[2026-11-21 Cursor data directories 4](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%204.md)'
  - '[2026-11-21 Cursor data directories 5](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%205.md)'
  - '[2026-11-21 Cursor data directories 6](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%206.md)'
  - '[2026-11-21 Cursor data directories 7](../../study-results/Cursor/2026-11-21%20Cursor%20data%20directories%207.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Cursor's help names the agent chat database and ~/.cursor/worktrees as the main disk users;
    the user-data paths and ~/.cursor extensions rest on Cursor forum posts, one by Cursor staff.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cursor](../../stores/Cursor.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Cursor documentation states the user-data directory per platform or which of its subfolders (such
  as cached data) are safe to delete.
- That ~/.cursor/extensions is the extensions subfolder is assumed from VS Code layout; sources only say
  ~/.cursor holds extensions.
- Agent worktrees may hold uncommitted agent work, so they are marked lost.
---

Cursor's help names the agent chat database and ~/.cursor/worktrees as the main disk users; the user-data paths and ~/.cursor extensions rest on Cursor forum posts, one by Cursor staff.
