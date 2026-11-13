---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/session-persistence
  object:
    supported: partial
    note: --archived creates the session archived so it stays out of session lists
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Archived flag source v2.2.6](../../study-results/OpenCode/2026-11-09%20OpenCode%20Archived%20flag%20source%20v2.2.6.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v2.2.6, the first tag with the flag.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: 2.2.6
  until: null
  platform: []
  model: null
status: current
open:
  - Whether a run is saved by default was not checked.
---
