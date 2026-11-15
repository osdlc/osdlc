---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/effort
  object:
    supported: partial
    argv: []
    note: no effort flag; a parameterized model slug carries it, such as --model "claude-opus-4-8[effort=high]"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help model](../../study-results/Cursor/2026-11-09%20Cursor%20help%20model.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help shows effort as a bracket override on the model slug.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No separate effort flag appears in --help.
