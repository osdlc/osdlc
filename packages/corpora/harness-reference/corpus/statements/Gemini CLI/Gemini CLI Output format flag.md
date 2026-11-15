---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
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
    note: -o is the short form
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Output format flag help](../../study-results/Gemini%20CLI/2026-11-09%20Output%20format%20flag%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 0.65.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
