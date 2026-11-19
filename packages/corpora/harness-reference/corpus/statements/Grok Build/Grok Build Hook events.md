---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: hooks/events
  object:
    events:
      - SessionStart
      - UserPromptSubmit
      - PreToolUse
      - PostToolUse
      - PostToolUseFailure
      - PermissionDenied
      - Stop
      - StopFailure
      - StopCancelled
      - Notification
      - SubagentStart
      - SubagentStop
      - PreCompact
      - PostCompact
      - SessionEnd
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok hook event PermissionDenied](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20PermissionDenied.md)"
      - "[2026-11-14 grok hook event StopCancelled](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20StopCancelled.md)"
      - "[2026-11-14 grok hook event Notification](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20Notification.md)"
      - "[2026-11-14 grok hook event SubagentStart](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20SubagentStart.md)"
      - "[2026-11-14 grok hook event SubagentStop](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20SubagentStop.md)"
      - "[2026-11-14 grok hook event PreCompact](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20PreCompact.md)"
      - "[2026-11-14 grok hook event PostCompact](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20PostCompact.md)"
      - "[2026-11-14 grok hook event SessionEnd](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20SessionEnd.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The event table in the hooks crate.
  - hasEvidenceItems:
      - "[2026-11-14 grok hook event cadences](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20event%20cadences.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks guide names the session, turn and tool events.
reportedIn:
  - "[xai-org grok-build hooks event.rs](../../documents/github.com/xai-org%20grok-build%20hooks%20event.rs.md)"
  - "[Grok Build user guide Hooks](../../documents/github.com/Grok%20Build%20user%20guide%20Hooks.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Fifteen events: the eight the guide names in its opening sentence, and seven more from the event table in the source.
