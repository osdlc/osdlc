---
proposition:
  subject: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
  predicate: skills/name-validation
  object:
    length: 1-64
    charset: unicode lowercase alphanumeric characters and hyphens
    edges: no leading or trailing hyphen
    consecutive_hyphens: false
    colon_allowed: false
    must_match_directory: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Agent Skills Skill name validation](../../study-results/Agent%20Skills/2026-10-01%20Agent%20Skills%20Skill%20name%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-09 spec name rules](../../study-results/Agent%20Skills/2026-11-09%20spec%20name%20rules.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09.
reportedIn:
  - "[Agent Skills specification](../../documents/agentskills.io/Agent%20Skills%20specification.md)"
  - "[Agent Skills specification github.com](../../documents/github.com/Agent%20Skills%20specification%20github.com.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
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
