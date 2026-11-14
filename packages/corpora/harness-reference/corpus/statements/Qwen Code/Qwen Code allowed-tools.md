---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skill-frontmatter/allowed-tools
  object:
    supported: false
    basis: documented
    note: Qwen Code reads `allowedTools` instead
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code allowed-tools ignored docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20allowed-tools%20ignored%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: an allowed-tools field is ignored"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code allowedTools field source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20allowedTools%20field%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the parser reads the allowedTools key"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[allowed-tools](../../subjects/skill-frontmatter/allowed-tools.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The hyphenated `allowed-tools` field is ignored. Qwen Code has its own `allowedTools` field, an array. The strength is held at moderate because the statement that `allowed-tools` is ignored comes from the docs.
