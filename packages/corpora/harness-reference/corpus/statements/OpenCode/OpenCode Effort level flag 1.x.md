---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --variant
      - "{level}"
    note: values depend on the provider and model, such as high, max, minimal
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Variant flag source v1.19.5](../../study-results/OpenCode/2026-11-09%20OpenCode%20Variant%20flag%20source%20v1.19.5.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v1.19.5, the latest 1.x tag.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Model flag source v2.0.0](../../study-results/OpenCode/2026-11-09%20OpenCode%20Model%20flag%20source%20v2.0.0.md)"
    directionOfEvidenceProvided: neutral
    description: at v2.0.0, the first 2.x tag, the run command carries the variant in the model string instead, so the flag no longer holds from 2.0.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: 2.0.0
  platform: []
  model: null
status: current
---
