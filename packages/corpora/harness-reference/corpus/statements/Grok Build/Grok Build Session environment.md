---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/session-env
  object:
    vars:
      - GROK_SESSION_ID
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok session id env](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20env.md)"
      - "[2026-11-14 grok session id env mcp](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20env%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The session build inserts GROK_SESSION_ID into the session environment, and stdio MCP servers get it too.
  - hasEvidenceItems:
      - "[2026-11-14 grok hook session id variable](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20session%20id%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks guide lists it among hook variables.
reportedIn:
  - "[xai-org grok-build agent_rebuild.rs](../../documents/github.com/xai-org%20grok-build%20agent_rebuild.rs.md)"
  - "[xai-org grok-build mcp servers.rs](../../documents/github.com/xai-org%20grok-build%20mcp%20servers.rs.md)"
  - "[Grok Build user guide Hooks](../../documents/github.com/Grok%20Build%20user%20guide%20Hooks.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
