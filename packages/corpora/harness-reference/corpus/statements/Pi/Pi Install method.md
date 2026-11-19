---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        package: https://pi.dev/install.sh
        note: curl -fsSL https://pi.dev/install.sh | sh
      - kind: npm
        package: "@earendil-works/pi-coding-agent"
        argv:
          - npm
          - install
          - -g
          - --ignore-scripts
          - "@earendil-works/pi-coding-agent"
    update: pi update
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi readme script install](../../study-results/Pi/2026-11-09%20Pi%20readme%20script%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README script install.
  - hasEvidenceItems:
      - "[2026-11-09 Pi readme npm install](../../study-results/Pi/2026-11-09%20Pi%20readme%20npm%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README npm install.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help update default](../../study-results/Pi/2026-11-09%20Pi%20help%20update%20default.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi update` updates pi only by default."
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
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
