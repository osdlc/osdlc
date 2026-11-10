---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        argv:
          - bash
          - -c
          - curl -fsSL https://opencode.ai/v2/install | bash
      - kind: npm
        argv:
          - npm
          - i
          - -g
          - "@opencode/cli@latest"
        package: "@opencode/cli"
      - kind: brew
        argv:
          - brew
          - install
          - anomalyco/tap/opencode-v2
        package: anomalyco/tap/opencode-v2
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode README v2.1.0 install](../../study-results/OpenCode/2026-11-09%20OpenCode%20README%20v2.1.0%20install.md)"
      - "[2026-11-09 OpenCode README v2.1.0 npm install](../../study-results/OpenCode/2026-11-09%20OpenCode%20README%20v2.1.0%20npm%20install.md)"
      - "[2026-11-09 OpenCode README v2.1.0 brew install](../../study-results/OpenCode/2026-11-09%20OpenCode%20README%20v2.1.0%20brew%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README at v2.1.0, the first tag listing all three.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: 2.1.0
  until: null
  platform: []
  model: null
status: current
open:
  - The install commands of the 1.x line were not checked.
---
