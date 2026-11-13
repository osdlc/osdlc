---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/agent-loading
  object:
    mechanism: model reads SKILL.md
    base_dir: given to the model, so relative scripts/ paths resolve
    trigger: task matches the description
    explicit: /skill:name
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Pi How the agent loads a skill](../../study-results/Pi/2026-10-01%20Pi%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-11-04 Pi How the agent loads a skill](../../study-results/Pi/2026-11-04%20Pi%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
  - "[Pi docs Skills (main at d57c2d2)](../../documents/github.com/Pi%20docs%20Skills%20%28main%20at%20d57c2d2%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: superseded
imported_from: fact:skills/agent-loading@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/agent-loading.md`.

The observations disagree on: mechanism. The latest value is kept.

Superseded 2026-11-09 by a statement with a source-cited value. The earlier object is unchanged.
