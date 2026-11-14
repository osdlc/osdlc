---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/user-invocation
  object:
    syntax: /acme-tools:review
    also: "`/skills` opens the Skills panel to browse and launch skills"
    note: a personal or project skill is `/<skill-name>`
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill invocation docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20invocation%20docs.md)"
      - "[2026-11-14 Qwen Code Extension skill bare name docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skill%20bare%20name%20docs.md)"
      - "[2026-11-14 Qwen Code Skills panel docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skills%20panel%20docs.md)"
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
subject: "[User invocation syntax](../../subjects/skills/User%20invocation%20syntax.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A skill is run as a slash command under its registered name. For a skill from an extension that name carries the extension.
