---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --allowed-tools
      - "{rules}"
    deny_argv:
      - --exclude-tools
      - "{rules}"
    note: allowed tools bypass confirmation; excluded tools are excluded
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Allowed tools option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Allowed%20tools%20option%20source.md)"
      - "[2026-11-09 Qwen Code Allowed tools description source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Allowed%20tools%20description%20source.md)"
      - "[2026-11-09 Qwen Code Exclude tools option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Exclude%20tools%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
