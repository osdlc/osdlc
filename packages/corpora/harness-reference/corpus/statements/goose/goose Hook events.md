---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: hooks/events
  object:
    count: "12"
    via: hooks/hooks.json in a plugin
    events:
      - PreToolUse
      - PreToolUseResult
      - PostToolUse
      - PostToolUseFailure
      - SessionStart
      - SessionEnd
      - UserPromptSubmit
      - BeforeReadFile
      - AfterFileEdit
      - BeforeShellExecution
      - AfterShellExecution
      - Stop
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose hook event enum](../../study-results/goose/2026-11-14%20goose%20hook%20event%20enum.md)"
      - "[2026-11-14 goose hooks live in plugins](../../study-results/goose/2026-11-14%20goose%20hooks%20live%20in%20plugins.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The HookEvent enum lists the events, and the module doc says where hooks live.
reportedIn:
  - "[aaif-goose goose hooks mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20hooks%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The source defines twelve hook events. The count is ours; the source lists them without a number.
