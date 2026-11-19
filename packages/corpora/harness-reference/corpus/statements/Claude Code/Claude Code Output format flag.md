---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
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
    note: Print mode only; text is the default.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help output format](../../study-results/Claude%20Code/2026-11-09%20help%20output%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Help text lists text (default), json and stream-json, print mode only.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli output-format](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20output-format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference lists the same three formats.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does stream-json need --verbose in print mode? No help or docs excerpt here says so, though the osdlc agent-call adapter always adds it; if it is required, formats[stream-json].argv gains --verbose.
---
