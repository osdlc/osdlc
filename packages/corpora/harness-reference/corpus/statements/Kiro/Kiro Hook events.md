---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: hooks/events
  object:
    events:
      - SessionStart
      - SessionEnd
      - UserPromptSubmit
      - Stop
      - PreToolUse
      - PostToolUse
      - PreCompact
      - PostCompact
      - PostFileCreate
      - PostFileSave
      - PostFileDelete
      - PreTaskExec
      - PostTaskExec
      - Manual
    via: .kiro/hooks/*.json
    note: SessionEnd is CLI V3 only; PreCompact and PostCompact are CLI V3 from 3.1.0 (the IDE has Pre and Post Compaction too). CLI V3 accepts AgentSpawn and agentSpawn as spellings of SessionStart, and lists Manual hooks without a way to invoke them.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro hook triggers table](../../study-results/Kiro/2026-11-14%20kiro%20hook%20triggers%20table.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the trigger table of the v1 hook schema."
  - hasEvidenceItems:
      - "[2026-11-14 kiro SessionEnd trigger](../../study-results/Kiro/2026-11-14%20kiro%20SessionEnd%20trigger.md)"
      - "[2026-11-14 kiro PreCompact trigger](../../study-results/Kiro/2026-11-14%20kiro%20PreCompact%20trigger.md)"
      - "[2026-11-14 kiro PostCompact trigger](../../study-results/Kiro/2026-11-14%20kiro%20PostCompact%20trigger.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the CLI V3 triggers."
  - hasEvidenceItems:
      - "[2026-11-14 kiro AgentSpawn alias](../../study-results/Kiro/2026-11-14%20kiro%20AgentSpawn%20alias.md)"
      - "[2026-11-14 kiro Manual trigger](../../study-results/Kiro/2026-11-14%20kiro%20Manual%20trigger.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the alias and the Manual trigger."
  - hasEvidenceItems:
      - "[2026-11-14 kiro standalone hook files](../../study-results/Kiro/2026-11-14%20kiro%20standalone%20hook%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: where standalone hooks live."
reportedIn:
  - "[Kiro docs IDE 1.0 Hooks](../../documents/kiro.dev/Kiro%20docs%20IDE%201.0%20Hooks.md)"
  - "[Kiro docs Hook types](../../documents/kiro.dev/Kiro%20docs%20Hook%20types.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
