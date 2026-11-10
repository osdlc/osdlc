---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/agent-loading
  object:
    trigger: request clearly matches a skill, or the user names it
    explicit: /skills <name> in the CLI
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 goose How the agent loads a skill](../../study-results/goose/2026-11-04%20goose%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[goose docs Skills](../../documents/goose-docs.ai/goose%20docs%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What mechanism loads the body (a tool or a file read)?
imported_from: fact:skills/agent-loading@goose#scope-[null,null,null]
---

Imported from `facts/goose/skills/agent-loading.md`.

Open questions:
- What mechanism loads the body (a tool or a file read)?
