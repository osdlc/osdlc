---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/marketplace-git-ref
  object:
    ref_syntax: owner/repo[@ref]
    argv:
      - plugin
      - marketplace
      - add
      - <SOURCE>
      - --ref
      - <REF>
    subpath: --sparse <PATH>
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Marketplace git ref help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Marketplace%20git%20ref%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Marketplace git ref flag](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Marketplace%20git%20ref%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Marketplace git ref sparse](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Marketplace%20git%20ref%20sparse.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
