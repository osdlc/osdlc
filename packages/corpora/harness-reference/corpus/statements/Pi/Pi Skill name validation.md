---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/name-validation
  object:
    checks: length up to 64, ^[a-z0-9-]+$, no edge or double hyphens
    blocking: false
    must_match_directory: false
    rejects_only: a missing description
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Pi Skill name validation](../../study-results/Pi/2026-10-01%20Pi%20Skill%20name%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/name-validation@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/name-validation.md`.
