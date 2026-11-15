---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        argv:
          - bash
          - -c
          - curl -fsSL https://gh.io/copilot-install | bash
      - kind: brew
        argv:
          - brew
          - install
          - copilot-cli
        package: copilot-cli
      - kind: other
        argv:
          - winget
          - install
          - GitHub.Copilot
        package: GitHub.Copilot
        note: WinGet
      - kind: npm
        argv:
          - npm
          - install
          - -g
          - "@github/copilot"
        package: "@github/copilot"
    update: copilot update
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI README curl install](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20README%20curl%20install.md)"
      - "[2026-11-09 GitHub Copilot CLI README npm install](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20README%20npm%20install.md)"
      - "[2026-11-09 GitHub Copilot CLI README brew install](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20README%20brew%20install.md)"
      - "[2026-11-09 GitHub Copilot CLI README winget install](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20README%20winget%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README installation section.
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Update command docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Update%20command%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "command reference: copilot update."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
