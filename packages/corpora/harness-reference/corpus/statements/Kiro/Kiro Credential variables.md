---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: KIRO_API_KEY
        kind: api-key
        provider: Kiro
        precedence: below an active browser session from kiro-cli login
    login_command: kiro-cli login
    note: For non-interactive (headless) runs; required there. API keys are for Kiro Pro, Pro+, Pro Max and Power subscribers.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro api key variable](../../study-results/Kiro/2026-11-14%20kiro%20api%20key%20variable.md)"
      - "[2026-11-14 kiro headless api key](../../study-results/Kiro/2026-11-14%20kiro%20headless%20api%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the variable and where it is used."
  - hasEvidenceItems:
      - "[2026-11-14 kiro authentication precedence](../../study-results/Kiro/2026-11-14%20kiro%20authentication%20precedence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: precedence against a stored login."
  - hasEvidenceItems:
      - "[2026-11-14 kiro api key plans](../../study-results/Kiro/2026-11-14%20kiro%20api%20key%20plans.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the plans that can use API keys."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli login command](../../study-results/Kiro/2026-11-14%20kiro%20cli%20login%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the login command."
reportedIn:
  - "[Kiro docs Authentication](../../documents/kiro.dev/Kiro%20docs%20Authentication.md)"
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
