---
proposition:
  subject: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
  predicate: skills/discovery-walk
  object:
    scope_paths:
      - .agents/skills
      - ~/.agents/skills
      - client-specific directories
    ancestor_dirs: some implementations scan ancestor directories up to the git root
    scan_bounds: max depth 4-6 levels, max 2000 directories suggested
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Agent Skills Skill discovery walk](../../study-results/Agent%20Skills/2026-11-04%20Agent%20Skills%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Agent Skills how to add skills support to your agent](../../documents/agentskills.io/Agent%20Skills%20how%20to%20add%20skills%20support%20to%20your%20agent.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the standard say anything about symlinked skill folders?
imported_from: fact:skills/discovery-walk@agent-skills#scope-[null,null,null]
---

Imported from `facts/agent-skills/skills/discovery-walk.md`.

Open questions:
- Does the standard say anything about symlinked skill folders?
