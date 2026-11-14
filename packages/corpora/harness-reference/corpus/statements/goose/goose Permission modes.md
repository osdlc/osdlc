---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: auto
        intent: full-auto
        env:
          GOOSE_MODE: auto
        config_key: GOOSE_MODE
        notes: Automatically approves tool calls.
      - name: approve
        intent: read-only
        env:
          GOOSE_MODE: approve
        config_key: GOOSE_MODE
        notes: Asks before every tool call. The intent is the closest fixed value.
      - name: smart_approve
        intent: read-only
        env:
          GOOSE_MODE: smart_approve
        config_key: GOOSE_MODE
        notes: Asks only for sensitive tool calls. The intent is the closest fixed value.
      - name: chat
        intent: read-only
        env:
          GOOSE_MODE: chat
        config_key: GOOSE_MODE
        notes: Chat only, no tool calls.
    default: auto
    note: No command-line flag selects a mode. In a session, /mode <name> switches it.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose goose mode enum](../../study-results/goose/2026-11-14%20goose%20goose%20mode%20enum.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The GooseMode enum and the meaning of each mode.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs GOOSE_MODE](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_MODE.md)"
      - "[2026-11-14 goose docs autonomous default](../../study-results/goose/2026-11-14%20goose%20docs%20autonomous%20default.md)"
      - "[2026-11-14 goose docs mode command](../../study-results/goose/2026-11-14%20goose%20docs%20mode%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs give the variable, its values, the default and the /mode command.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option groups of goose run hold no mode flag.
reportedIn:
  - "[aaif-goose goose goose_mode.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose_mode.rs%20at%202365bc5.md)"
  - "[aaif-goose goose environment-variables.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20environment-variables.md%20at%202365bc5.md)"
  - "[aaif-goose goose goose-permissions.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-permissions.md%20at%202365bc5.md)"
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose has four modes: `auto`, `approve`, `smart_approve` and `chat`. `GOOSE_MODE` selects one, as a variable or a config key; `auto` is the default.
