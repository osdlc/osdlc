---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: PI_CODING_AGENT
        value: "true"
        meaning: running inside Pi
      - name: AI_AGENT
        value: pi
        meaning: generic agent marker
    note: inherited by child processes; not set automatically when Pi is embedded through the SDK
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi env process marker](../../study-results/Pi/2026-11-09%20Pi%20env%20process%20marker.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Environment variables page.
  - hasEvidenceItems:
      - "[2026-11-09 Pi env inherited markers](../../study-results/Pi/2026-11-09%20Pi%20env%20inherited%20markers.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Inheritance and SDK.
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
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
