---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/marketplace
  object:
    supported: true
    install_id: <marketplace-name>:<plugin-name>
    note: marketplace sources are Claude plugin marketplaces; they feed the Discover tab of `/extensions manage`
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Marketplace install docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Marketplace%20install%20docs.md)"
      - "[2026-11-14 Qwen Code Marketplace sources docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Marketplace%20sources%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs at v0.27.3
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Qwen Code has no marketplace format of its own. It installs plugins from Claude plugin marketplaces and converts them. The catalog file is covered by the Marketplace fields statement.
