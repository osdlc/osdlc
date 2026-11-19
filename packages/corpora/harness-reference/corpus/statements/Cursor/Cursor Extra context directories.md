---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/context-dirs
  object:
    supported: true
    argv:
      - --add-dir
      - <path>
    repeatable: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help add-dir](../../study-results/Cursor/2026-11-09%20Cursor%20help%20add-dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --add-dir is repeatable.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Extra context directories](../../subjects/cli/Extra%20context%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Whether added roots are also trusted was not checked.
