---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/structured-output
  object:
    output: --output-format json|stream-json (with --print)
    partial: --stream-partial-output with stream-json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help output-format](../../study-results/Cursor/2026-11-09%20Cursor%20help%20output-format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Installed --help.
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
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
