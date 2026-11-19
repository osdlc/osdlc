---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/marketplace
  object:
    supported: true
    file: .agents/plugins/marketplace.json
    install_id: plugin-name@marketplace-name
    git_subpath: true
    note: A JSON catalog in a repository or at ~/.agents/plugins/marketplace.json. Sources are added with codex plugin marketplace add.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Marketplace help](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Marketplace%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help text of codex-cli 0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Marketplace catalog docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Marketplace%20catalog%20docs.md)"
      - "[2026-11-14 Codex CLI Marketplace file docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Marketplace%20file%20docs.md)"
      - "[2026-11-14 Codex CLI Marketplace install id docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Marketplace%20install%20id%20docs.md)"
      - "[2026-11-14 Codex CLI Marketplace git subfolder docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Marketplace%20git%20subfolder%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
reportedIn:
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The catalog's fields are under Marketplace fields, and pinning a git ref under Marketplace git ref.
