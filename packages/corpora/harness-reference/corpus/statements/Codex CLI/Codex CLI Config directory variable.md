---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: config/config-dir-env
  object:
    var: CODEX_HOME
    replaces: ~/.codex
    still_reads_home:
      - ~/.agents/skills
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Config directory variable source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Config%20directory%20variable%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Config directory variable user home skills](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Config%20directory%20variable%20user%20home%20skills.md)"
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
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
