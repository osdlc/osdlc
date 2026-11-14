---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    store: ~/.kiro
    note: Saved on every conversation turn to a SQLite database, keyed by directory. --delete-session <ID> deletes one.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro sessions saved every turn](../../study-results/Kiro/2026-11-14%20kiro%20sessions%20saved%20every%20turn.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: sessions are saved automatically."
  - hasEvidenceItems:
      - "[2026-11-14 kiro session store](../../study-results/Kiro/2026-11-14%20kiro%20session%20store.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: where they are stored."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli delete-session](../../study-results/Kiro/2026-11-14%20kiro%20cli%20delete-session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: deleting a session."
reportedIn:
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
