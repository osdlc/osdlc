---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: false
    env:
      COPILOT_CUSTOM_INSTRUCTIONS_DIRS: comma-separated list of additional directories for custom instructions
    note: --no-custom-instructions disables loading custom instructions from AGENTS.md and related files; no system prompt flag was found in the command reference
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Custom instructions env docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Custom%20instructions%20env%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI No custom instructions option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20No%20custom%20instructions%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: >-
      The command reference lists these two options and no system prompt flag. Absence in docs is
      weak.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
