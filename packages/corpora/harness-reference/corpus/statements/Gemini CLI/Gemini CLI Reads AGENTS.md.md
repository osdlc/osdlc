---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: instructions/agents-md
  object:
    supported: false
    workaround: list AGENTS.md in `context.fileName` in settings.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI default context file name source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20default%20context%20file%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: the only default context file name is GEMINI.md (absence of AGENTS.md)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI context file name setting docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20context%20file%20name%20setting%20docs.md)"
      - "[2026-11-14 Gemini CLI context file name example docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20context%20file%20name%20example%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: other names are read only when the setting lists them; the example lists AGENTS.md."
reportedIn:
  - "[google-gemini gemini-cli core src tools memoryTool.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20tools%20memoryTool.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli gemini-md.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20gemini-md.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Reads AGENTS.md](../../subjects/instructions/Reads%20AGENTS.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Out of the box Gemini CLI reads `GEMINI.md` only. `AGENTS.md` is read when `context.fileName` names it.
