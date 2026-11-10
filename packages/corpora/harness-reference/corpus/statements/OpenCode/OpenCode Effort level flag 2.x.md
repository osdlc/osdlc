---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/effort
  object:
    supported: partial
    argv:
      - --model
      - "{provider/model}#{level}"
    note: the run command source defines no --variant flag at v2.0.0 or v2.2.6; the variant goes in the model string
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Model flag source v2.0.0](../../study-results/OpenCode/2026-11-09%20OpenCode%20Model%20flag%20source%20v2.0.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v2.0.0.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Model flag source v2.2.6](../../study-results/OpenCode/2026-11-09%20OpenCode%20Model%20flag%20source%20v2.2.6.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v2.2.6.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode CLI docs variant row](../../study-results/OpenCode/2026-11-09%20OpenCode%20CLI%20docs%20variant%20row.md)"
    directionOfEvidenceProvided: neutral
    description: the v2.2.6 docs table still lists --variant.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: 2.0.0
  until: null
  platform: []
  model: null
status: current
open:
  - The v2.2.6 CLI docs table still lists --variant, which the command definition does not define.
---
