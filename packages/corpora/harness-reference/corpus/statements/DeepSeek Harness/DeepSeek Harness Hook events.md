---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: hooks/events
  object:
    events:
      - SessionStart
      - UserPromptSubmit
      - PreToolUse
      - PostToolUse
      - Stop
      - SubagentStart
      - SubagentStop
    via: Claude Code hooks bridge
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Hook events](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Hook%20events.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:hooks/events@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/hooks/events.md`.
