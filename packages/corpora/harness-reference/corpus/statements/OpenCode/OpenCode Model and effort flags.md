---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/model-selection
  object:
    model: -m, --model provider/model
    provider: chosen in the model string
    effort: "1.x: run --variant <level>; 2.x: provider/model#variant in --model"
    model_list: opencode models [provider]
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Run model flag help](../../study-results/OpenCode/2026-11-09%20OpenCode%20Run%20model%20flag%20help.md)"
      - "[2026-11-09 OpenCode Run variant flag help](../../study-results/OpenCode/2026-11-09%20OpenCode%20Run%20variant%20flag%20help.md)"
      - "[2026-11-09 OpenCode Models command help](../../study-results/OpenCode/2026-11-09%20OpenCode%20Models%20command%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 1.1.36.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Model flag source v2.2.6](../../study-results/OpenCode/2026-11-09%20OpenCode%20Model%20flag%20source%20v2.2.6.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v2.2.6: provider/model#variant."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
