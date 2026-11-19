---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/fork
  object:
    supported: true
    flags: --session-file <path>
    note: loads a session from a JSON file into a new session with a new id; not allowed together with --resume or --session-id
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI session-file option source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session-file%20option%20source.md)"
      - "[2026-11-14 Gemini CLI session file import source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session%20file%20import%20source.md)"
      - "[2026-11-14 Gemini CLI session flags are exclusive source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20session%20flags%20are%20exclusive%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the flag, the new session id given to the imported conversation, and the rule that the three session flags exclude each other."
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
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--session-file` reads a conversation record from a file, gives it a fresh session id and writes it as a new session file. The source session is not changed. Inside a session, `/resume save <tag>` names a branch point; that is a checkpoint, not a new session.
