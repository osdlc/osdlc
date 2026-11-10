---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/binary
  object:
    supported: true
    name: pi
    version_argv:
      - --version
    note: npm package @earendil-works/pi-coding-agent
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi version](../../study-results/Pi/2026-11-09%20Pi%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi --version` prints 1.5.0."
  - hasEvidenceItems:
      - "[2026-11-09 Pi readme npm install](../../study-results/Pi/2026-11-09%20Pi%20readme%20npm%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README installs the npm package that provides pi.
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
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
