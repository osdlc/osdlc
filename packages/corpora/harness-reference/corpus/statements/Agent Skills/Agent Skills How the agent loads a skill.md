---
proposition:
  subject: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
  predicate: skills/agent-loading
  object:
    body_at_startup: false
    body_on: when the skill is activated
    mechanism: file read of SKILL.md, or a dedicated activation tool
    user_activation: /skill-name or $skill-name, besides file-read or dedicated tool activation by the model
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Agent Skills How the agent loads a skill](../../study-results/Agent%20Skills/2026-11-04%20Agent%20Skills%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Agent Skills How the agent loads a skill 2](../../study-results/Agent%20Skills/2026-11-04%20Agent%20Skills%20How%20the%20agent%20loads%20a%20skill%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Agent Skills specification](../../documents/agentskills.io/Agent%20Skills%20specification.md)"
  - "[Agent Skills how to add skills support to your agent](../../documents/agentskills.io/Agent%20Skills%20how%20to%20add%20skills%20support%20to%20your%20agent.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/agent-loading@agent-skills#scope-[null,null,null]
---

Imported from `facts/agent-skills/skills/agent-loading.md`.
