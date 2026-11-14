---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/body-size
  object:
    numeric_limit: false
    cap: none of its own; a model read of SKILL.md is cut at 2000 lines or 50KB per read call, and `/skill:name` inserts the whole body
    same_cap_as: read tool
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi read tool truncation](../../study-results/Pi/2026-11-14%20Pi%20read%20tool%20truncation.md)"
      - "[2026-11-14 Pi read tool limits](../../study-results/Pi/2026-11-14%20Pi%20read%20tool%20limits.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The read tool the model loads a skill with truncates and asks for offset reads.
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill command block](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20block.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: /skill:name reads the whole file.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill field limits](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20field%20limits.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The skills page limits only name and description.
reportedIn:
  - "[Pi source read.ts at v1.5.2](../../documents/github.com/Pi%20source%20read.ts%20at%20v1.5.2.md)"
  - "[Pi source truncate.ts at v1.5.2](../../documents/github.com/Pi%20source%20truncate.ts%20at%20v1.5.2.md)"
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Skill body size](../../subjects/skills/Skill%20body%20size.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The skill loader has no body limit; that part is an absence, so the statement is held at moderate. The docs give no size advice.
