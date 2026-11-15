---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/session-load
  object:
    supported: true
    load_argv:
      - -e
      - <package or path>
    repeatable: true
    persists: false
    disable_argv:
      - --no-extensions
    note: "-e also takes npm: sources, cached under ~/.pi/agent/tmp/extensions"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help extension skill flags](../../study-results/Pi/2026-11-09%20Pi%20help%20extension%20skill%20flags.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --extension is repeatable.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages try once](../../study-results/Pi/2026-11-09%20Pi%20packages%20try%20once.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Packages tried for one invocation.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help no-extensions](../../study-results/Pi/2026-11-09%20Pi%20help%20no-extensions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --no-extensions.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages e cache](../../study-results/Pi/2026-11-09%20Pi%20packages%20e%20cache.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Cache location.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages e npm example](../../study-results/Pi/2026-11-09%20Pi%20packages%20e%20npm%20example.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: npm example.
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
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
