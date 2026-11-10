---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        argv:
          - sh
          - -c
          - curl -fsSL https://ampcode.com/install.sh | bash
        platforms:
          - macos
          - linux
      - kind: brew
        argv:
          - brew
          - install
          - ampcode/tap/ampcode
        platforms:
          - macos
          - linux
      - kind: script
        argv:
          - powershell
          - -c
          - irm https://ampcode.com/install.ps1 | iex
        platforms:
          - windows
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 cli install script](../../study-results/Amp/2026-11-09%20cli%20install%20script.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 cli install brew](../../study-results/Amp/2026-11-09%20cli%20install%20brew.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 cli install windows](../../study-results/Amp/2026-11-09%20cli%20install%20windows.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Amp docs CLI getting started](../../documents/ampcode.com/Amp%20docs%20CLI%20getting%20started.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


