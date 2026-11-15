---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
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
    note: only works with --print; the default is text; --stream-partial-output adds text deltas to stream-json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help output-format](../../study-results/Cursor/2026-11-09%20Cursor%20help%20output-format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help lists text, json and stream-json with default text.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help stream-partial-output](../../study-results/Cursor/2026-11-09%20Cursor%20help%20stream-partial-output.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --stream-partial-output.
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
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Shape follows the coordinator’s new formats/argv form.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
