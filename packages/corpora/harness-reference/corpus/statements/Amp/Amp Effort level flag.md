---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --effort
      - "{level}"
    levels:
      - none
      - minimal
      - low
      - medium
      - high
      - xhigh
      - max
    note: In execute mode --effort needs a model (--model, or a model id in --mode). Amp rejects a level the model does not support. Without the flag the thread runs at the model's default effort.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 effort flag](../../study-results/Amp/2026-11-14%20effort%20flag.md)"
      - "[2026-11-14 effort needs a model](../../study-results/Amp/2026-11-14%20effort%20needs%20a%20model.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The model selector page names the flag and its limits.
  - hasEvidenceItems:
      - "[2026-11-14 effort levels](../../study-results/Amp/2026-11-14%20effort%20levels.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The SDK page lists the effort levels.
reportedIn:
  - "[Amp docs Model Selector](../../documents/ampcode.com/Amp%20docs%20Model%20Selector.md)"
  - "[Amp docs SDK](../../documents/ampcode.com/Amp%20docs%20SDK.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

