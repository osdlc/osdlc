---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/structured-output
  object:
    output: --output-format stream-json (run events as JSON Lines on stdout; V2 or V3 harness)
    partial: in V3 an interrupted run ends with a final interruption record
    argv:
      - chat
      - --no-interactive
      - --output-format
      - stream-json
      - <prompt>
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless stream-json](../../study-results/Kiro/2026-11-14%20kiro%20headless%20stream-json.md)"
      - "[2026-11-14 kiro stream-json needs V2 or V3](../../study-results/Kiro/2026-11-14%20kiro%20stream-json%20needs%20V2%20or%20V3.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the stream-json format."
  - hasEvidenceItems:
      - "[2026-11-14 kiro stream-json interruption record](../../study-results/Kiro/2026-11-14%20kiro%20stream-json%20interruption%20record.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: interrupted runs."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
