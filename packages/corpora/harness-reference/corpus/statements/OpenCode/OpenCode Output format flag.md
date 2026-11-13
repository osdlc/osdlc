---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: default
        argv:
          - --format
          - default
      - name: json
        argv:
          - --format
          - json
    note: default is formatted text; json is raw JSON events
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Run format flag help](../../study-results/OpenCode/2026-11-09%20OpenCode%20Run%20format%20flag%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 1.1.36.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Run command source v2.2.6](../../study-results/OpenCode/2026-11-09%20OpenCode%20Run%20command%20source%20v2.2.6.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v2.2.6 has the same two choices.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
