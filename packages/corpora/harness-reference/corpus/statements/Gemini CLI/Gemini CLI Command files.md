---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: commands/files
  object:
    supported: true
    note: TOML files under ~/.gemini/commands and .gemini/commands; the file path gives the command name
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI custom command file format docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20custom%20command%20file%20format%20docs.md)"
      - "[2026-11-14 Gemini CLI custom command locations docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20custom%20command%20locations%20docs.md)"
      - "[2026-11-14 Gemini CLI custom command naming docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20custom%20command%20naming%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: custom commands are .toml files in two directories."
reportedIn:
  - "[google-gemini gemini-cli docs cli custom-commands.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20custom-commands.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Command files](../../subjects/commands/Command%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Custom commands are `.toml` files. A project file wins over a user file with the same name, and a subdirectory becomes a `:` namespace.
