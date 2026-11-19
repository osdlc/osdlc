---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --trust-tools=<tool-ids>
    config_key: rules in ~/.kiro/settings/permissions.yaml (user) and ~/.kiro/workspace-roots/<hash>/permissions.yaml (workspace); the permissions field of an agent profile
    syntax: "a rule has a capability (such as shell, fs_write, mcp), match globs, an optional exclude and an effect: deny, ask, allow or evaluate"
    precedence: deny > ask > allow > evaluate, whatever scope a rule comes from
    note: --trust-tools takes a comma-separated list of tool IDs, works in non-interactive V3 runs and is ignored by interactive V3.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless trust-tools flag](../../study-results/Kiro/2026-11-14%20kiro%20headless%20trust-tools%20flag.md)"
      - "[2026-11-14 kiro trust-tools ignored when interactive](../../study-results/Kiro/2026-11-14%20kiro%20trust-tools%20ignored%20when%20interactive.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the --trust-tools flag."
  - hasEvidenceItems:
      - "[2026-11-14 kiro user permissions file](../../study-results/Kiro/2026-11-14%20kiro%20user%20permissions%20file.md)"
      - "[2026-11-14 kiro workspace permissions file](../../study-results/Kiro/2026-11-14%20kiro%20workspace%20permissions%20file.md)"
      - "[2026-11-14 kiro agent scope permissions](../../study-results/Kiro/2026-11-14%20kiro%20agent%20scope%20permissions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: where rules are written."
  - hasEvidenceItems:
      - "[2026-11-14 kiro permission match patterns](../../study-results/Kiro/2026-11-14%20kiro%20permission%20match%20patterns.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: match patterns."
  - hasEvidenceItems:
      - "[2026-11-14 kiro permission rule precedence](../../study-results/Kiro/2026-11-14%20kiro%20permission%20rule%20precedence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: precedence."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
  - "[Kiro docs Permissions](../../documents/kiro.dev/Kiro%20docs%20Permissions.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
