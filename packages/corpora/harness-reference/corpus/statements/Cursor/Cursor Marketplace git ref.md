---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: --git-ref <ref>
    kinds:
      - branch
      - tag
      - commit
    argv:
      - plugin
      - marketplace
      - add
      - <gitUrl>
      - --git-ref
      - <ref>
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help plugin marketplace add](../../study-results/Cursor/2026-11-09%20Cursor%20help%20plugin%20marketplace%20add.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --git-ref takes a branch, tag or commit.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help plugin marketplace](../../study-results/Cursor/2026-11-09%20Cursor%20help%20plugin%20marketplace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The add command takes a git URL.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
