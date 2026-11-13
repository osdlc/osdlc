---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/limits
  object:
    supported: false
    note: no max-turns, budget or timeout flag in --help
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help print](../../study-results/Cursor/2026-11-09%20Cursor%20help%20print.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The --print help lists no limit option; the full flag list was read.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in --help only; hidden flags are possible.
