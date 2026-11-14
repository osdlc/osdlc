---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: -s/--session-id <uuid>
    note: The value must be a valid UUID that is not already in use under the target session directory. It creates a session and does not resume one.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli session-id flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20session-id%20flag.md)"
      - "[2026-11-14 grok cli session-id flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20session-id%20flag%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definition of -s/--session-id.
  - hasEvidenceItems:
      - "[2026-11-14 grok session id flag doc](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20flag%20doc.md)"
      - "[2026-11-14 grok session id create only](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20create%20only.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless and sessions guides.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Sessions](../../documents/github.com/Grok%20Build%20user%20guide%20Sessions.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
