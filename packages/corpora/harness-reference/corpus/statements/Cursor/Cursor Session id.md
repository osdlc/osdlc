---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/session-id
  object:
    supported: partial
    result_field: session_id
    reported_in:
      - json
    note: a new chat id comes from `agent create-chat` or the json result; no documented flag assigns one
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs json session_id](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20json%20session_id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The json result carries session_id.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help create-chat](../../study-results/Cursor/2026-11-09%20Cursor%20help%20create-chat.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`create-chat` returns a new chat id."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A hidden --new-session-id flag is used by a consumer but does not appear in --help or the docs, so it is not recorded.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
