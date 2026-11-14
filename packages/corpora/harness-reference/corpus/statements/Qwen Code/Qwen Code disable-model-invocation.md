---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: the skill is hidden from the model; the user can still run it with `/<skill-name>`
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code disable-model-invocation source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20disable-model-invocation%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the parser reads the key"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code disable-model-invocation docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20disable-model-invocation%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: what it does"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Setting `disable-model-invocation: true` hides the skill from model invocation and keeps direct user invocation.
