---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: text
        argv: []
      - name: stream-json
        argv:
          - --output-format
          - stream-json
    note: stream-json writes run events as JSON Lines on stdout and requires the V2 or V3 harness. Plain text is what a run prints without the flag.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless stream-json](../../study-results/Kiro/2026-11-14%20kiro%20headless%20stream-json.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the stream-json format."
  - hasEvidenceItems:
      - "[2026-11-14 kiro stream-json needs V2 or V3](../../study-results/Kiro/2026-11-14%20kiro%20stream-json%20needs%20V2%20or%20V3.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the harness it needs."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless plain text](../../study-results/Kiro/2026-11-14%20kiro%20headless%20plain%20text.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: plain-text runs."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
