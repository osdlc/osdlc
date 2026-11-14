---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill description required source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20description%20required%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: a missing or empty description is a parse error"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill field requirements docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20field%20requirements%20docs.md)"
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
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The description must be a non-empty string. Neither the source read nor the docs state a length limit.
