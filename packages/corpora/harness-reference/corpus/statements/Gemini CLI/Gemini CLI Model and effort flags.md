---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/model-selection
  object:
    model: -m, --model <string> (also GEMINI_MODEL)
    provider: Google only
    effort: none; thinking config lives in settings (modelConfigs, thinkingBudget)
    model_list: none
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-09 Gemini CLI Model and effort flags](../../study-results/Gemini%20CLI/2026-10-09%20Gemini%20CLI%20Model%20and%20effort%20flags.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-10-09.
  - hasEvidenceItems:
      - "[2026-11-09 Model flag help 0.65](../../study-results/Gemini%20CLI/2026-11-09%20Model%20flag%20help%200.65.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 0.65.0 agrees on -m/--model.
reportedIn:
  - "[gemini harness notes for a dispatcher](../../documents/skillwright/gemini%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/model-selection@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/cli/model-selection.md`.
