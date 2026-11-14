---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: hooks/events
  object:
    events:
      - agentStop
      - errorOccurred
      - notification
      - permissionRequest
      - postToolUse
      - postToolUseFailure
      - preCompact
      - preToolUse
      - sessionEnd
      - sessionStart
      - subagentStart
      - subagentStop
      - userPromptSubmitted
      - userPromptTransformed
    note: a PascalCase event name such as SessionStart selects the VS Code compatible payload format
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Hook events table docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Hook%20events%20table%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Hook events CLI support docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Hook%20events%20CLI%20support%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks reference lists every supported event and says the CLI supports all of them.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Hook event name formats docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Hook%20event%20name%20formats%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks reference describes the two event name spellings.
reportedIn:
  - "[Copilot docs hooks reference](../../documents/docs.github.com/Copilot%20docs%20hooks%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The events are the rows of the hooks reference table, in its order. The page states no count.
