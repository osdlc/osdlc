---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/agent-skills-format
  object:
    supported: true
    layout: <skills dir>/<skill-name>/SKILL.md
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code SKILL.md folder format docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20SKILL.md%20folder%20format%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: a skill is a SKILL.md file plus optional supporting files"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill directory entries source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20directory%20entries%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: each skill is a directory"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Agent Skills format](../../subjects/skills/Agent%20Skills%20format.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A skill is a directory holding `SKILL.md` with YAML frontmatter (`name`, `description`). The docs call them Agent Skills but do not name agentskills.io, so the strength is held at moderate.
