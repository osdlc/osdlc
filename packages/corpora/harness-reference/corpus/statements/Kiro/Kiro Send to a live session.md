---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    mechanism: "cloud sessions: any client (Web, Mobile, IDE, CLI) attaches to the running session and steers it; the CLI attaches with --resume-id <session-id>"
    limit: a local session can be active in one process at a time
    acp: "`_session/steer` extension method"
    note: In the terminal UI, a message typed while the agent works is sent mid-turn (steer mode) or queued.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cloud session clients attach](../../study-results/Kiro/2026-11-14%20kiro%20cloud%20session%20clients%20attach.md)"
      - "[2026-11-14 kiro cloud session resume and steer](../../study-results/Kiro/2026-11-14%20kiro%20cloud%20session%20resume%20and%20steer.md)"
      - "[2026-11-14 kiro cli resumes cloud sessions](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resumes%20cloud%20sessions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: clients attach to a running cloud session."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session active in one process](../../study-results/Kiro/2026-11-14%20kiro%20session%20active%20in%20one%20process.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the limit for local sessions."
  - hasEvidenceItems:
      - "[2026-11-14 kiro acp session steer method](../../study-results/Kiro/2026-11-14%20kiro%20acp%20session%20steer%20method.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the ACP steering method."
  - hasEvidenceItems:
      - "[2026-11-14 kiro queue steering mid-turn](../../study-results/Kiro/2026-11-14%20kiro%20queue%20steering%20mid-turn.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: steering in the terminal UI."
reportedIn:
  - "[Kiro docs Cloud sessions](../../documents/kiro.dev/Kiro%20docs%20Cloud%20sessions.md)"
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
  - "[Kiro docs Migrate an ACP client to CLI V3](../../documents/kiro.dev/Kiro%20docs%20Migrate%20an%20ACP%20client%20to%20CLI%20V3.md)"
  - "[Kiro docs Queue steering](../../documents/kiro.dev/Kiro%20docs%20Queue%20steering.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
