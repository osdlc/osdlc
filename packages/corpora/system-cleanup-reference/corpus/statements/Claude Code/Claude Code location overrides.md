---
proposition:
  subject: '[Claude Code](../../stores/Claude%20Code.md)'
  predicate: location/override
  object:
    vars:
    - CLAUDE_CONFIG_DIR
    settings:
    - cleanupPeriodDays
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Claude Code location overrides 1](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20location%20overrides%201.md)'
  - '[2026-11-21 Claude Code location overrides 2](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20location%20overrides%202.md)'
  - '[2026-11-21 Claude Code location overrides 3](../../study-results/Claude%20Code/2026-11-21%20Claude%20Code%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The settings page says CLAUDE_CONFIG_DIR moves the ~/.claude files; cleanupPeriodDays sets
    how long transcripts are kept.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Claude Code](../../stores/Claude%20Code.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No variable that moves ~/.local/share/claude/versions is documented on the pages read.
---

The settings page says CLAUDE_CONFIG_DIR moves the ~/.claude files; cleanupPeriodDays sets how long transcripts are kept.
