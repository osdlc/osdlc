---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: hooks/events
  object:
    count: "23"
    events:
      - PreToolUse
      - PostToolUse
      - PostToolUseFailure
      - PostToolBatch
      - Notification
      - UserPromptSubmit
      - UserPromptExpansion
      - SessionStart
      - Stop
      - MessageDisplay
      - SubagentStart
      - SubagentStop
      - PreCompact
      - PostCompact
      - SessionEnd
      - SessionDelete
      - PermissionRequest
      - PermissionDenied
      - StopFailure
      - TodoCreated
      - TodoCompleted
      - InstructionsLoaded
      - FileChanged
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Hook events enum source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Hook%20events%20enum%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the HookEventName enum, 23 members"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Hook events docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Hook%20events%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: the Hook Events table lists the same 23"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The events are the members of the `HookEventName` enum, in its order. The docs table lists the same names.
