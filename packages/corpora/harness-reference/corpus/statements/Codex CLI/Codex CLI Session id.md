---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/session-id
  object:
    supported: partial
    format: UUID
    result_field: thread_id
    env_var: CODEX_THREAD_ID
    note: No flag assigns an id; exec --json reports it in the thread.started event.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Session id docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Session%20id%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Session id source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Session%20id%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Session id resume argument](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Session%20id%20resume%20argument.md)"
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
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
