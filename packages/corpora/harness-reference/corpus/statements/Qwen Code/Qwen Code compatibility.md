---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skill-frontmatter/compatibility
  object:
    supported: false
    basis: undocumented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill frontmatter keys kept source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20frontmatter%20keys%20kept%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at v0.27.3: the parser builds the skill from a fixed list of keys, and `compatibility` is not one of them (absence)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[compatibility](../../subjects/skill-frontmatter/compatibility.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The SKILL.md parser copies a fixed set of frontmatter keys into the skill config. `compatibility` is not among them, so Qwen Code does not read it. The skills docs do not mention the field. A skill that carries it still loads.
