---
proposition:
  subject: '[Claude Code](../../stores/Claude%20Code.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.local/share/claude/versions
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/claude/versions
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.claude/projects
      holds: state
      rebuild: lost
    - platform: all
      path: ~/.claude/file-history
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Claude Code data directories 1](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20data%20directories%201.md)'
  - '[2026-11-21 Claude Code data directories 2](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20data%20directories%202.md)'
  - '[2026-11-21 Claude Code data directories 3](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20data%20directories%203.md)'
  - '[2026-11-21 Claude Code data directories 4](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The setup page places native-installer versions under ~/.local/share/claude/versions/,
    and the .claude directory page lists transcripts under projects/ and checkpoint snapshots under file-history/,
    both user data.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Claude Code](../../stores/Claude%20Code.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Where the native installer keeps versions on Windows is not stated in prose; the uninstall steps only
  show a PowerShell command for %USERPROFILE%\.local\share\claude.
---

The setup page places native-installer versions under ~/.local/share/claude/versions/, and the .claude directory page lists transcripts under projects/ and checkpoint snapshots under file-history/, both user data.
