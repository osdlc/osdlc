---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/duplicate-names
  object:
    rule: first found wins, with a collision diagnostic naming both paths
    order: user skills before project skills
    winner: first discovered skill
    diagnostic: warning
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Pi Duplicate skill names](../../study-results/Pi/2026-10-01%20Pi%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-09 Pi skills name collisions](../../study-results/Pi/2026-11-09%20Pi%20skills%20name%20collisions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page.
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
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - In which order are user, project, .agents and package skill locations scanned, so which scope wins a collision?
imported_from: fact:skills/duplicate-names@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/duplicate-names.md`.

Open questions:
- In which order are user, project, .agents and package skill locations scanned, so which scope wins a collision?

Rechecked 2026-11-09 against the installed pi 1.5.0 and the v1.5.0 source tree.
