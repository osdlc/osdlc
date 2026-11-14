---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: --session-id <uuid> -n <name>
    note: "`--session-id` opens a new session only when the value is a valid UUID that matches no existing session; `-n`, `--name` names the new session"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Session name option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Session%20name%20option%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Session id new session docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Session%20id%20new%20session%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference describes both options.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Both options are in the command reference. A name or an id prefix passed to `--session-id` does not create a session.
