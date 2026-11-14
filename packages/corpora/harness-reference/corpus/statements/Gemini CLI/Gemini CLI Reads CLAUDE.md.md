---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: instructions/claude-md
  object:
    supported: false
    note: only GEMINI.md is read by default; `context.fileName` in settings.json can name other files
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI default context file name source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20default%20context%20file%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: the only default context file name is GEMINI.md (absence of CLAUDE.md)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI context file name setting docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20context%20file%20name%20setting%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: other names are read only when the setting lists them."
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
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Out of the box Gemini CLI reads `GEMINI.md` only. No source names `CLAUDE.md`; the `context.fileName` setting takes any file name.
