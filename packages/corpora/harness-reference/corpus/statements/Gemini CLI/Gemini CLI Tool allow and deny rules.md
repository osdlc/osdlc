---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --allowed-tools
      - "{rules}"
    note: --allowed-tools is deprecated in favour of the policy engine, whose files load with --policy; deny is a policy rule decision and tools.exclude is deprecated
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Allowed tools help](../../study-results/Gemini%20CLI/2026-11-09%20Allowed%20tools%20help.md)"
      - "[2026-11-09 Policy flag help](../../study-results/Gemini%20CLI/2026-11-09%20Policy%20flag%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 0.65.0.
  - hasEvidenceItems:
      - "[2026-11-09 Policy engine deny docs](../../study-results/Gemini%20CLI/2026-11-09%20Policy%20engine%20deny%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: policy engine docs on deny and tools.exclude.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
