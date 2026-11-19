---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/fork
  object:
    supported: true
    command: /fork
    note: alias /branch; an interactive slash command that clones the current conversation, up to the current turn, into a new session
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 conversations fork](../../study-results/Antigravity/2026-11-14%20conversations%20fork.md)"
      - "[2026-11-14 reference fork command](../../study-results/Antigravity/2026-11-14%20reference%20fork%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The conversations page and the slash command table both describe /fork.
reportedIn:
  - "[Antigravity docs CLI conversations](../../documents/antigravity.google/Antigravity%20docs%20CLI%20conversations.md)"
  - "[Antigravity docs CLI commands](../../documents/antigravity.google/Antigravity%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`/fork` (alias `/branch`) copies the current conversation into a new session with its own id and switches the terminal to it. The docs describe it only as a slash command inside the TUI; they name no command-line flag that forks a saved conversation.
