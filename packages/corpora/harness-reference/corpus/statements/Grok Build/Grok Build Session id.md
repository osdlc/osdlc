---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/session-id
  object:
    supported: true
    assign_argv:
      - --session-id
      - "{id}"
    format: uuid (a UUIDv7 when Grok generates it)
    reported_in:
      - result
      - event
      - env
    result_field: sessionId
    env_var: GROK_SESSION_ID
    creates_on_missing: true
    note: "--session-id only creates a session: it errors when the value is not a UUID or the id is already in use. The json result carries sessionId; streaming-messages-json lines carry session_id."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli session-id flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20session-id%20flag.md)"
      - "[2026-11-14 grok cli session-id flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20session-id%20flag%202.md)"
      - "[2026-11-14 grok session id env](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20env.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definition of -s/--session-id and the session environment.
  - hasEvidenceItems:
      - "[2026-11-14 grok session id format](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20format.md)"
      - "[2026-11-14 grok json sessionId](../../study-results/Grok%20Build/2026-11-14%20grok%20json%20sessionId.md)"
      - "[2026-11-14 grok stream session_id](../../study-results/Grok%20Build/2026-11-14%20grok%20stream%20session_id.md)"
      - "[2026-11-14 grok session id create only](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20create%20only.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The sessions and headless guides.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[xai-org grok-build agent_rebuild.rs](../../documents/github.com/xai-org%20grok-build%20agent_rebuild.rs.md)"
  - "[Grok Build user guide Sessions](../../documents/github.com/Grok%20Build%20user%20guide%20Sessions.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
