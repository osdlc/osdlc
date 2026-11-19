---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/session-id
  object:
    supported: partial
    assign_argv:
      - --session
      - "{id}"
    note: a --session id that does not exist is created
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Session flag source v2.0.19](../../study-results/OpenCode/2026-11-09%20OpenCode%20Session%20flag%20source%20v2.0.19.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v2.0.19, the first tag with the create-if-missing wording.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: 2.0.19
  until: null
  platform: []
  model: null
status: current
---
