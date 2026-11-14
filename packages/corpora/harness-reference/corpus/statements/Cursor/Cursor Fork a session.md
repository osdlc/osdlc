---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/fork
  object:
    supported: true
    command: /fork
    note: a slash command inside an interactive session; it forks the current chat; aliases /branch and /duplicate; no fork flag in `agent --help`
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs slash fork](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20slash%20fork.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The slash command reference lists /fork.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog fork](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20fork.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI changelog announces /fork and its aliases.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor help full option list](../../study-results/Cursor/2026-11-14%20Cursor%20help%20full%20option%20list.md)"
    directionOfEvidenceProvided: neutral
    description: The option list has no flag that forks a saved session.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No source shows a way to fork a saved session that is not the current one, other than resuming it first.
