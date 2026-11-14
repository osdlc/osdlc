---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    note: "`--continue`, `--resume [chatId]` and `agent ls` reopen saved chats; no flag in `agent --help` turns saving off"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor help full option list](../../study-results/Cursor/2026-11-14%20Cursor%20help%20full%20option%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The installed CLI lists --resume [chatId], --continue, `ls` and `resume`, and no flag that turns saving off.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog continue transcripts](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20continue%20transcripts.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog says transcripts persist to disk.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No source names where chats are stored. The Hooks page speaks of transcripts being disabled, but no page says how. Held at moderate.
