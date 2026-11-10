---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    disable_argv:
      - --no-session
    store: ~/.pi/agent/sessions, grouped by working directory; PI_CODING_AGENT_SESSION_DIR or --session-dir moves it
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help session-id fork](../../study-results/Pi/2026-11-09%20Pi%20help%20session-id%20fork.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --no-session and --session-dir in --help.
  - hasEvidenceItems:
      - "[2026-11-09 Pi sessions storage](../../study-results/Pi/2026-11-09%20Pi%20sessions%20storage.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Default store.
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
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
