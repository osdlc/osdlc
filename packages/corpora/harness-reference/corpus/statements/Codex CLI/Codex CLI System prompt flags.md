---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: partial
    replace_file_argv:
      - -c
      - model_instructions_file="<path>"
    append_argv:
      - -c
      - developer_instructions="<text>"
    replace_drops_defaults: true
    note: No dedicated flag; both are config keys set with -c. The source discourages model_instructions_file.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI System prompt flags source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20System%20prompt%20flags%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI System prompt flags developer](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20System%20prompt%20flags%20developer.md)"
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
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
