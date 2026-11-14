---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/resume
  object:
    supported: true
    flags: --resume (-r), --resume-id <ID>, --resume-picker
    by: session id (a UUID); --resume-id takes a local or cloud session id
    latest: --resume
    picker: --resume-picker
    command: kiro-cli chat --v3 --no-interactive --resume-id <session-id> "<prompt>"
    argv:
      - chat
      - --no-interactive
      - --resume-id
      - <id>
      - <prompt>
    refused_when: the session is active in another process
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli resume flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume%20flag.md)"
      - "[2026-11-14 kiro cli resume-id flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume-id%20flag.md)"
      - "[2026-11-14 kiro cli resume-picker flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume-picker%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the resume flags."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless resume by id with a prompt](../../study-results/Kiro/2026-11-14%20kiro%20headless%20resume%20by%20id%20with%20a%20prompt.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: resuming by id with a new prompt."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session active in one process](../../study-results/Kiro/2026-11-14%20kiro%20session%20active%20in%20one%20process.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: one process per session."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session id format](../../study-results/Kiro/2026-11-14%20kiro%20session%20id%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the id format."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs Cloud sessions](../../documents/kiro.dev/Kiro%20docs%20Cloud%20sessions.md)"
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
