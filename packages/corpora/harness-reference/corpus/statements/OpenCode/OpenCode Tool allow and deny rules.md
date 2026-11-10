---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    config_key: permission
    syntax: 'per action: "allow", "ask" or "deny"'
    note: no CLI flag; OPENCODE_PERMISSION carries inline JSON permissions config
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Permission config docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Permission%20config%20docs.md)"
      - "[2026-11-09 OpenCode Permission actions docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Permission%20actions%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: permissions docs.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Permission env docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Permission%20env%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: OPENCODE_PERMISSION carries inline permissions JSON.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
