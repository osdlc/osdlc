---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/limits
  object:
    supported: false
    note: codex exec has no turn, budget or timeout option.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Run limits help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Run%20limits%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "help-text observed 2026-11-09 at 0.162.0: the option list holds no turn, budget or timeout option (absence)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether config.toml has a turn or budget key was not checked.
---
