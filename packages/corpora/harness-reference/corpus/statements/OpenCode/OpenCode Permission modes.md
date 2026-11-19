---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: permissions/modes
  object:
    supported: partial
    modes:
      - name: auto
        intent: full-auto
        argv:
          - --auto
        notes: approves requests that would ask; explicit deny rules still apply
    note: otherwise permissions are set per action in the permission config, or inline in OPENCODE_PERMISSION
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Auto option source v1.17.12](../../study-results/OpenCode/2026-11-09%20OpenCode%20Auto%20option%20source%20v1.17.12.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v1.17.12, the first 1.x tag with the option.
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode OPENCODE_PERMISSION source v1.19.5](../../study-results/OpenCode/2026-11-09%20OpenCode%20OPENCODE_PERMISSION%20source%20v1.19.5.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: OPENCODE_PERMISSION in the v1.19.5 flags.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: 1.17.12
  until: null
  platform: []
  model: null
status: current
---
