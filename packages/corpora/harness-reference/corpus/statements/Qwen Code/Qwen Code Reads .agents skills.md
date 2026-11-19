---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/agents-dir
  object:
    supported: true
    note: project `.agents/skills` and user `~/.agents/skills`; the `.qwen` folder wins on a name clash
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill provider dirs source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20provider%20dirs%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the skill provider directories are .qwen and .agents"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Project agents skills docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Project%20agents%20skills%20docs.md)"
      - "[2026-11-14 Qwen Code Personal skills dirs docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Personal%20skills%20dirs%20docs.md)"
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
subject: "[Reads .agents skills](../../subjects/skills/Reads%20.agents%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Both the project and the user `.agents/skills` directories are read.
