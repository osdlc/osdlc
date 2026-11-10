---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: permissions/modes
  object:
    supported: false
    modes: []
    note: "docs: Pi does not ask for approval before every tool call; the tool set is chosen with --tools / --exclude-tools"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi security no approval](../../study-results/Pi/2026-11-09%20Pi%20security%20no%20approval.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "Security page: no approval before every tool call."
  - hasEvidenceItems:
      - "[2026-11-09 Pi help tools](../../study-results/Pi/2026-11-09%20Pi%20help%20tools.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --tools and --exclude-tools in --help.
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
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The sandbox claim rests on the docs saying Pi does not sandbox tool calls.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
