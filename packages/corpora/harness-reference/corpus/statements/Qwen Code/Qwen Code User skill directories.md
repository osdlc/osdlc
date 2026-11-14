---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/user-dirs
  object:
    dirs:
      - ~/.qwen/skills
      - ~/.agents/skills
    dirs_setting: skills.directories
    note: "`~/.qwen/skills` wins on a name clash"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code User skill base dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20User%20skill%20base%20dirs%20source.md)"
      - "[2026-11-14 Qwen Code Skill provider dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20provider%20dirs%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at v0.27.3
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Personal skills dirs docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Personal%20skills%20dirs%20docs.md)"
      - "[2026-11-14 Qwen Code Claude skills directory docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Claude%20skills%20directory%20docs.md)"
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
subject: "[User skill directories](../../subjects/skills/User%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The `.qwen` directory sits under the global Qwen directory, which `QWEN_HOME` can move.
