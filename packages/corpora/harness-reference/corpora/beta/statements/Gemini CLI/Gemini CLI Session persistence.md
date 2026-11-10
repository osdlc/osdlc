---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    store: ~/.gemini/tmp/<project_hash>/chats/
    note: the default policy is to retain sessions for 30 days
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Session recording docs](../../study-results/Gemini%20CLI/2026-11-09%20Session%20recording%20docs.md)"
      - "[2026-11-09 Session location docs](../../study-results/Gemini%20CLI/2026-11-09%20Session%20location%20docs.md)"
      - "[2026-11-09 Session retention docs](../../study-results/Gemini%20CLI/2026-11-09%20Session%20retention%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: session management docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
