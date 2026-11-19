---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: OPENCODE
        value: "1"
        meaning: set at startup of the opencode process
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode OPENCODE env source v1.19.5](../../study-results/OpenCode/2026-11-09%20OpenCode%20OPENCODE%20env%20source%20v1.19.5.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v1.19.5.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether 2.x still sets OPENCODE was not found in the v2.2.6 source.
---
