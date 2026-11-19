---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: partial
    note: "Set through a custom agent selected with --agent <name>: the agent's `prompt` field (JSON; inline text or a file:// URI) or its Markdown body is the system prompt."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro agent prompt field](../../study-results/Kiro/2026-11-14%20kiro%20agent%20prompt%20field.md)"
      - "[2026-11-14 kiro agent system prompt placement](../../study-results/Kiro/2026-11-14%20kiro%20agent%20system%20prompt%20placement.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: where an agent's system prompt lives."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli agent flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20agent%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the flag that selects an agent."
reportedIn:
  - "[Kiro docs Custom agents configuration reference](../../documents/kiro.dev/Kiro%20docs%20Custom%20agents%20configuration%20reference.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
