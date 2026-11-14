---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/open-with-id
  object:
    supported: false
    basis: omitted-from-help
    note: "`agent create-chat` returns a generated id; `/rename <name>` names a chat after it is open"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor help full option list](../../study-results/Cursor/2026-11-14%20Cursor%20help%20full%20option%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option list has no flag that sets the id or name of a new session; `create-chat` takes no id.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs slash rename](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20slash%20rename.md)"
    directionOfEvidenceProvided: neutral
    description: A chat can be renamed from inside the session.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in `agent --help` only.
