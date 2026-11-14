---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    basis: documented
    note: not read by default; the `skills.directories` setting can add `~/.claude/skills`
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill provider dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20provider%20dirs%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at v0.27.3: the skill provider directories are .qwen and .agents only (absence)"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Claude skills directory docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Claude%20skills%20directory%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: another agent's folder is added through skills.directories"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`.claude` is not one of the directories skills are read from. The docs show `~/.claude/skills` as a folder a user may add in `skills.directories`.
