---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name`; an extension skill gets `<extension name>:` in front
    required_fields:
      - name
      - description
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill name required source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20name%20required%20source.md)"
      - "[2026-11-14 Qwen Code Skill description required source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20description%20required%20source.md)"
      - "[2026-11-14 Qwen Code Extension skill name source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skill%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v0.27.3
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The name comes from the frontmatter only. A SKILL.md without `name` fails to parse; the directory name is not used.
