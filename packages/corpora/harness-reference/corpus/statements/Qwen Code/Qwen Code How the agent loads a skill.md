---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/agent-loading
  object:
    mechanism: Skill tool call
    example: 'Skill { skill: "rust:pdf" }'
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Qwen Code How the agent loads a skill](../../study-results/Qwen%20Code/2026-11-04%20Qwen%20Code%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Qwen Code docs Skills](../../documents/qwenlm.github.io/Qwen%20Code%20docs%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is the body loaded only on invocation, or also at startup?
imported_from: fact:skills/agent-loading@qwen-code#scope-[null,null,null]
---

Imported from `facts/qwen-code/skills/agent-loading.md`.

Open questions:
- Is the body loaded only on invocation, or also at startup?
