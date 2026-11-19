---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/subagent-visibility
  object:
    supported: partial
    per_agent_control: permission.skill and tools.skill in agent config
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 OpenCode Skills in subagents](../../study-results/OpenCode/2026-11-04%20OpenCode%20Skills%20in%20subagents.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[OpenCode docs Agent Skills](../../documents/opencode.ai/OpenCode%20docs%20Agent%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a subagent started by another agent see the skill tool and the same skill list?
imported_from: fact:skills/subagent-visibility@opencode#scope-[null,null,null]
---

Imported from `facts/opencode/skills/subagent-visibility.md`.

Open questions:
- Does a subagent started by another agent see the skill tool and the same skill list?
