---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --tools
      - "{rules}"
    deny_argv:
      - --exclude-tools
      - "{rules}"
    syntax: comma-separated tool names or * patterns
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help tools](../../study-results/Pi/2026-11-09%20Pi%20help%20tools.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help.
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
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
