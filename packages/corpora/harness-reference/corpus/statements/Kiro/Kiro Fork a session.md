---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/fork
  object:
    supported: true
    command: /rewind [turn]
    note: "An in-session slash command (CLI only): it creates a new session from the chosen turn and leaves the original intact. /chat save in one terminal then /chat load in another also makes a separate copy."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro rewind forks a session](../../study-results/Kiro/2026-11-14%20kiro%20rewind%20forks%20a%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: /rewind forks into a new session."
  - hasEvidenceItems:
      - "[2026-11-14 kiro fork with chat save and load](../../study-results/Kiro/2026-11-14%20kiro%20fork%20with%20chat%20save%20and%20load.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: forking with /chat save and /chat load."
reportedIn:
  - "[Kiro docs Checkpoints and rewind](../../documents/kiro.dev/Kiro%20docs%20Checkpoints%20and%20rewind.md)"
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
