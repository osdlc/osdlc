---
proposition:
  subject: '[Claude Code](../../stores/Claude%20Code.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: claude purge
      removes: 'one project''s transcripts, auto memory, tasks, debug and file-history entries, history
        lines and ~/.claude.json entry (user data: lost)'
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Claude Code clean command 1](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%201.md)'
  - '[2026-11-21 Claude Code clean command 2](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%202.md)'
  - '[2026-11-21 Claude Code clean command 3](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%203.md)'
  - '[2026-11-21 Claude Code clean command 4](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%204.md)'
  - '[2026-11-21 Claude Code clean command 5](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%205.md)'
  - '[2026-11-21 Claude Code clean command 6](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20clean%20command%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The native installer prunes old versions on its own (keeping the launcher's version, running
    versions and the two newest), transcripts older than cleanupPeriodDays are swept automatically, and
    claude purge deletes one project's state.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Claude Code](../../stores/Claude%20Code.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The native installer prunes old versions on its own (keeping the launcher's version, running versions and the two newest), transcripts older than cleanupPeriodDays are swept automatically, and claude purge deletes one project's state.
