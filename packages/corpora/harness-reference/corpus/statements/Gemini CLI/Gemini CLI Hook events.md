---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: hooks/events
  object:
    count: "11"
    events:
      - BeforeTool
      - AfterTool
      - BeforeAgent
      - Notification
      - AfterAgent
      - SessionStart
      - SessionEnd
      - PreCompress
      - BeforeModel
      - AfterModel
      - BeforeToolSelection
    via: hooks in settings.json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI hook event names source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hook%20event%20names%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the HookEventName enum."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI hook events docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hook%20events%20docs.md)"
      - "[2026-11-14 Gemini CLI hooks configured in settings docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hooks%20configured%20in%20settings%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the event table and where hooks are configured."
reportedIn:
  - "[google-gemini gemini-cli core src hooks types.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20hooks%20types.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs hooks index.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20hooks%20index.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The enum in `packages/core/src/hooks/types.ts` has eleven events, the same eleven as the table in the hooks docs. The count is ours; the source does not state a number.
