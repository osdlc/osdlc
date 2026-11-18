---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/append-system-prompt
  object:
    supported: false
    basis: omitted-from-help
    note: no flag adds text to the system prompt; GEMINI_SYSTEM_MD replaces the whole built-in prompt
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI CLI option list source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20CLI%20option%20list%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: the option list of the default command holds no system prompt option (absence)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI CLI options table docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20CLI%20options%20table%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs: the CLI options table lists no system prompt option (absence)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI system prompt full replacement docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20system%20prompt%20full%20replacement%20docs.md)"
      - "[2026-11-09 System prompt override docs](../../study-results/Gemini%20CLI/2026-11-09%20System%20prompt%20override%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs: the one documented way to change the system prompt replaces it."
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli cli-reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20cli-reference.md%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli system-prompt.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20system-prompt.md%20at%205a5c718.md)"
  - "[Gemini CLI source system-prompt.md at dc6602c](../../documents/github.com/Gemini%20CLI%20source%20system-prompt.md%20at%20dc6602c.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Gemini CLI 0.68.0 has no flag that appends to the system prompt. The option list in `packages/cli/src/config/config.ts` has none, and the docs describe only `GEMINI_SYSTEM_MD`, which replaces the built-in prompt. The value rests on an absence, so it is moderate.
