---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: false
    env:
      COPILOT_CUSTOM_INSTRUCTIONS_DIRS: comma-separated list of additional directories for custom instructions
    config: providers.json `models[].systemMessage` appends to, replaces or customizes the system instructions for one model of a custom provider (mode append, replace or customize)
    note: --no-custom-instructions disables loading custom instructions from AGENTS.md and related files; no system prompt flag was found in the command reference
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Custom instructions env docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Custom%20instructions%20env%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI No custom instructions option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20No%20custom%20instructions%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The command reference lists these two options and no system prompt flag. Absence in docs is weak.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI providers.json model systemMessage docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20providers.json%20model%20systemMessage%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI providers.json systemMessage modes docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20providers.json%20systemMessage%20modes%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The configuration directory reference documents models[].systemMessage in providers.json and its modes.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs CLI config directory reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20config%20directory%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[GitHub Copilot CLI System prompt flags](GitHub%20Copilot%20CLI%20System%20prompt%20flags.md)"
---

There is still no command-line flag for the system prompt. The value adds what the configuration reference documents for custom providers: `models[].systemMessage` in `providers.json`. The strength stays weak, because `supported: false` rests on the flag being absent from the docs.
