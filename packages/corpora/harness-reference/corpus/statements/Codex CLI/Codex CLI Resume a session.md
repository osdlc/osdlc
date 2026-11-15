---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/resume
  object:
    supported: true
    command: codex resume [SESSION_ID] [PROMPT]
    by: UUID or exact name
    flags: --last, --all
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Codex CLI Resume a session](../../study-results/Codex%20CLI/2026-09-25%20Codex%20CLI%20Resume%20a%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Resume a session interactive](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Resume%20a%20session%20interactive.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
reportedIn:
  - "[Codex harness notes for a dispatcher](../../documents/skillwright/Codex%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/resume@codex#scope-[null,null,null]
---

Imported from `facts/codex/cli/resume.md`.
