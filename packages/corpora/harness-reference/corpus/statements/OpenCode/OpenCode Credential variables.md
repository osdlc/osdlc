---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: config/credentials-env
  object:
    supported: partial
    login_command: opencode auth login
    note: stored logins go in ~/.local/share/opencode/auth.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Credentials docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Credentials%20docs.md)"
      - "[2026-11-09 OpenCode Auth login docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Auth%20login%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: providers and CLI docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which environment variables supply provider keys was not checked.
---
