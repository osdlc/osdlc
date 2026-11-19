---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - chat
      - --resume
    chosen_by: the previous conversation from the current directory; in V3 the newest local session (or cloud session, for a cloud launch), passing over sessions with no prompt or turn from 3.3.0
    accepts_prompt: true
    note: -r is the short form
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli resume flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the CLI reference describes --resume / -r."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli resume picks newest session](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume%20picks%20newest%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: how V3 picks the session."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli resume with no-interactive](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume%20with%20no-interactive.md)"
      - "[2026-11-14 kiro headless needs an instruction](../../study-results/Kiro/2026-11-14%20kiro%20headless%20needs%20an%20instruction.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: --resume combines with --no-interactive, which requires an instruction."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
