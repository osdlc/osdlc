---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/session-id
  object:
    format: UUID
    reported_in:
      - exit hint
      - /session-id
      - --list-sessions
      - stream-json
    result_field: sessionId
    obtained_by: command
    command:
      - /session-id
    note: On exit the CLI prints the id with the resume command. sessionId in stream-json sessionUpdate and runFinished records is documented for cloud runs.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro session id format](../../study-results/Kiro/2026-11-14%20kiro%20session%20id%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the id format."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session-id slash command](../../study-results/Kiro/2026-11-14%20kiro%20session-id%20slash%20command.md)"
      - "[2026-11-14 kiro session id on exit](../../study-results/Kiro/2026-11-14%20kiro%20session%20id%20on%20exit.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: reading the id in a session and on exit."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session id in stream-json](../../study-results/Kiro/2026-11-14%20kiro%20session%20id%20in%20stream-json.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the id in stream-json records."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli list-sessions](../../study-results/Kiro/2026-11-14%20kiro%20cli%20list-sessions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: listing saved sessions."
reportedIn:
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
  - "[Kiro docs Slash commands reference](../../documents/kiro.dev/Kiro%20docs%20Slash%20commands%20reference.md)"
  - "[Kiro docs Cloud sessions](../../documents/kiro.dev/Kiro%20docs%20Cloud%20sessions.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
