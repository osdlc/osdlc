---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --effort
      - <level>
    config_key: chat.modelDefaults
    levels:
      - low
      - medium
      - high
      - xhigh
      - max
    note: Not every model supports every level. In V3 the flag applies only to the session it starts and saves no default; /effort <level> changes it in a session.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli effort flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20effort%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the flag and its levels."
  - hasEvidenceItems:
      - "[2026-11-14 kiro effort levels depend on the model](../../study-results/Kiro/2026-11-14%20kiro%20effort%20levels%20depend%20on%20the%20model.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: levels depend on the model."
  - hasEvidenceItems:
      - "[2026-11-14 kiro effort persistent defaults](../../study-results/Kiro/2026-11-14%20kiro%20effort%20persistent%20defaults.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the settings key for per-model defaults."
  - hasEvidenceItems:
      - "[2026-11-14 kiro effort flag in headless runs](../../study-results/Kiro/2026-11-14%20kiro%20effort%20flag%20in%20headless%20runs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the flag is not saved in V3."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs Reasoning effort](../../documents/kiro.dev/Kiro%20docs%20Reasoning%20effort.md)"
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
