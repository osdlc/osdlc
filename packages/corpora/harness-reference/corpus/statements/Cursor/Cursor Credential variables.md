---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: CURSOR_API_KEY
        kind: api-key
    login_command: agent login
    note: --api-key does the same
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help api-key](../../study-results/Cursor/2026-11-09%20Cursor%20help%20api-key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help names CURSOR_API_KEY.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help login](../../study-results/Cursor/2026-11-09%20Cursor%20help%20login.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`login` command."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
