---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - -c
      - model_reasoning_effort="<level>"
    config_key: model_reasoning_effort
    note: No dedicated flag; the level is a config override. Available levels depend on the model.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Effort level flag source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Effort%20level%20flag%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Effort level flag docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Effort%20level%20flag%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Effort level flag config override](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Effort%20level%20flag%20config%20override.md)"
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
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
