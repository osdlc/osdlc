---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: config/credentials-env
  object:
    login_command: codex login
    vars:
      - name: CODEX_API_KEY
        kind: api-key
        provider: openai
        note: a documented single-run override for codex exec
      - name: OPENAI_API_KEY
        kind: api-key
        provider: openai
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Credential variables source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Credential%20variables%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Credential variables docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Credential%20variables%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Credential variables login](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Credential%20variables%20login.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which key wins when both are set was not checked.
---
