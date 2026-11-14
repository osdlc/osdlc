---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/session-env
  object:
    vars:
      - AGENT_DISPLAY_OUT
      - AGENT_CONTEXT_OUT
    note: Exported to shell commands the agent runs; each points to a per-invocation FIFO.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro shell side channel variables](../../study-results/Kiro/2026-11-14%20kiro%20shell%20side%20channel%20variables.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the export."
  - hasEvidenceItems:
      - "[2026-11-14 kiro AGENT_CONTEXT_OUT](../../study-results/Kiro/2026-11-14%20kiro%20AGENT_CONTEXT_OUT.md)"
      - "[2026-11-14 kiro AGENT_DISPLAY_OUT](../../study-results/Kiro/2026-11-14%20kiro%20AGENT_DISPLAY_OUT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the two variables."
reportedIn:
  - "[Kiro docs Built-in tools reference](../../documents/kiro.dev/Kiro%20docs%20Built-in%20tools%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
