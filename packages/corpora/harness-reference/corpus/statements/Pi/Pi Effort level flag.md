---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --thinking
      - <level>
    levels:
      - off
      - minimal
      - low
      - medium
      - high
      - xhigh
      - max
    note: a :<level> suffix on --model does the same
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help thinking](../../study-results/Pi/2026-11-09%20Pi%20help%20thinking.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --thinking levels.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help model thinking](../../study-results/Pi/2026-11-09%20Pi%20help%20model%20thinking.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --model accepts a :<thinking> suffix.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Clamping to the model is documented in the older model-selection statement.
