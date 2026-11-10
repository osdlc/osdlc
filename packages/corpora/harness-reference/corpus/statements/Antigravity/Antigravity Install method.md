---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        argv:
          - sh
          - -c
          - curl -fsSL https://antigravity.google/cli/install.sh | bash
        platforms:
          - macos
          - linux
      - kind: script
        argv:
          - powershell
          - -Command
          - irm https://antigravity.google/cli/install.ps1 | iex
        platforms:
          - windows
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 install script](../../study-results/Antigravity/2026-11-09%20install%20script.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 install windows script](../../study-results/Antigravity/2026-11-09%20install%20windows%20script.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Antigravity docs Getting started](../../documents/antigravity.google/Antigravity%20docs%20Getting%20started.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


