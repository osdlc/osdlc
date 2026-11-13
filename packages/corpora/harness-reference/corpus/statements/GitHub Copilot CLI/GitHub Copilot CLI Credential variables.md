---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: config/credentials-env
  object:
    supported: true
    login_command: copilot login
    vars:
      - name: COPILOT_GITHUB_TOKEN
        kind: other
        provider: GitHub
        precedence: first
      - name: GH_TOKEN
        kind: other
        provider: GitHub
        precedence: second
      - name: GITHUB_TOKEN
        kind: other
        provider: GitHub
        precedence: third
    note: classic personal access tokens (ghp_) are not supported
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Token env docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Token%20env%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Login command docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Login%20command%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Classic token docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Classic%20token%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: command reference.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
