---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    acp: "`agent acp`: session/prompt on a process the caller spawned"
    command: agent persist attach <session>
    sdk: run.steer(text) on a local run the caller holds
    limit: attach reconnects a terminal to a persistent session; no documented command sends one message into another running session
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs ACP session flow](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20ACP%20session%20flow.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: An ACP client sends session/prompt to a session it created or loaded.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs agent acp](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20agent%20acp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`agent acp` runs the CLI as an ACP server over stdio."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor help persist](../../study-results/Cursor/2026-11-14%20Cursor%20help%20persist.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`agent persist attach <session>` reconnects to a persistent session."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog persistent sessions](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20persistent%20sessions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog describes detach and reattach.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor SDK steer](../../study-results/Cursor/2026-11-14%20Cursor%20SDK%20steer.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The SDK can inject a message into a running local turn.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Held at moderate: the partial answer rests mostly on docs.
