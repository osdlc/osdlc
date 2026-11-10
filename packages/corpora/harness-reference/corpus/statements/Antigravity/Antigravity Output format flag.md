---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: text
        argv:
          - --output-format
          - text
      - name: json
        argv:
          - --output-format
          - json
      - name: stream-json
        argv:
          - --output-format
          - stream-json
    note: text is the default; json prints one envelope at the end; stream-json is NDJSON with init, step_update and result events
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 headless output format](../../study-results/Antigravity/2026-11-09%20headless%20output%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 headless text default](../../study-results/Antigravity/2026-11-09%20headless%20text%20default.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 headless json stream rows](../../study-results/Antigravity/2026-11-09%20headless%20json%20stream%20rows.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 headless stream events](../../study-results/Antigravity/2026-11-09%20headless%20stream%20events.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Antigravity docs CLI headless mode](../../documents/antigravity.google/Antigravity%20docs%20CLI%20headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


