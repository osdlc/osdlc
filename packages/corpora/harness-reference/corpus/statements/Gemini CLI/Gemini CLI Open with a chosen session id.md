---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: --session-id <id>
    note: letters, digits, dashes and underscores; the help text asks for a UUID; fails when the id already exists
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Session id help](../../study-results/Gemini%20CLI/2026-11-09%20Session%20id%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "help-text for 0.65.0: start a new session with a manually provided UUID."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI session-id option source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-id%20option%20source.md)"
      - "[2026-11-14 Gemini CLI session-id already exists source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-id%20already%20exists%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the characters accepted and the error for an id that exists."
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src gemini.tsx at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20gemini.tsx%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--session-id` starts a new session under the id the caller gives. The check in the source accepts letters, digits, dashes and underscores, not only a UUID. No flag sets a display name.
