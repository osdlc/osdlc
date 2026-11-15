---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: partial
    env:
      GEMINI_SYSTEM_MD: a path to a Markdown file
    replace_drops_defaults: true
    note: no system prompt flag in the 0.65.0 help; the environment variable replaces the built-in prompt
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 System prompt override docs](../../study-results/Gemini%20CLI/2026-11-09%20System%20prompt%20override%20docs.md)"
      - "[2026-11-09 System prompt env docs](../../study-results/Gemini%20CLI/2026-11-09%20System%20prompt%20env%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: system prompt override docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
