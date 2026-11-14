---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/session-id
  object:
    supported: true
    assign_argv:
      - --session-id
      - "{id}"
    format: any non-empty string of letters, digits, hyphens and underscores (`[a-zA-Z0-9-_]+`)
    note: The help text calls the value a UUID, but the option only checks the characters. An id that already exists is refused.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI session-id option source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-id%20option%20source.md)"
      - "[2026-11-14 Gemini CLI session-id allowed characters source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-id%20allowed%20characters%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: config.ts at v0.68.0 trims the value, refuses an empty one and tests it against /^[a-zA-Z0-9-_]+$/.
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI session-id already exists source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-id%20already%20exists%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: gemini.tsx at v0.68.0 stops with an error when the id already exists.
  - hasEvidenceItems:
      - "[2026-11-09 Session id help](../../study-results/Gemini%20CLI/2026-11-09%20Session%20id%20help.md)"
    directionOfEvidenceProvided: neutral
    description: The 0.65.0 help text describes the value as a manually provided UUID; it states no format check.
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src gemini.tsx at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20gemini.tsx%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Gemini CLI Session id](Gemini%20CLI%20Session%20id.md)"
---

The 2026-11-09 statement took the format from the help text, which says UUID. The option's source at v0.68.0 accepts any string of letters, digits, hyphens and underscores, so a UUID is one valid form and not the only one. The source of earlier versions was not read, so the scope is not limited.
