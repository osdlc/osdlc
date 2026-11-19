---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: hooks/events
  object:
    count: "12"
    via: hooks.json or [hooks] tables in config.toml
    events:
      - PreToolUse
      - PermissionRequest
      - PostToolUse
      - PreCompact
      - PostCompact
      - UserPromptSubmit
      - SubagentStop
      - Stop
      - SessionStart
      - SubagentStart
      - SessionEnd
      - Interrupt
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Hook events docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Hook%20events%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Hook events session](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Hook%20events%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Hook events location](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Hook%20events%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Hook events enum](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Hook%20events%20enum.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - SessionEnd and Interrupt come from the source enum HookEventName only; the docs page names the other ten. Their spelling in hooks.json was not checked (the enum serialises snake_case).
---
