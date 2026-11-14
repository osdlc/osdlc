---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: hooks/events
  object:
    count: "6"
    events:
      - SessionStart
      - PreToolUse
      - PostToolUse
      - PreInvocation
      - PostInvocation
      - Stop
    via: hooks.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 hooks supported events](../../study-results/Antigravity/2026-11-14%20hooks%20supported%20events.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks page lists the supported events in a table.
reportedIn:
  - "[Antigravity docs Hooks](../../documents/antigravity.google/Antigravity%20docs%20Hooks.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The hooks page lists six events. Only `PreToolUse` and `PostToolUse` use a matcher, which is the tool name.
