---
proposition:
  subject: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
  predicate: skills/name-validation
  object:
    length: 1-64
    charset: lowercase a-z, 0-9 and hyphens
    edges: no leading or trailing hyphen
    consecutive_hyphens: false
    colon_allowed: false
    must_match_directory: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Agent Skills Skill name validation](../../study-results/Agent%20Skills/2026-10-01%20Agent%20Skills%20Skill%20name%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
reportedIn:
  - "[Agent Skills specification](../../documents/agentskills.io/Agent%20Skills%20specification.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/name-validation@agent-skills#scope-[null,null,null]
---

Imported from `facts/agent-skills/skills/name-validation.md`.
