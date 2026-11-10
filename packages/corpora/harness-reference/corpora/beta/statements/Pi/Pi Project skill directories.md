---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - <cwd>/.pi/skills
      - .agents/skills
    scope: .agents/skills in each ancestor up to the git root
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Pi Project skill directories](../../study-results/Pi/2026-08-08%20Pi%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-10-01 Pi Project skill directories](../../study-results/Pi/2026-10-01%20Pi%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: disputed
imported_from: fact:skills/project-dirs@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/project-dirs.md`.

The observations disagree on: dirs. The latest value is kept.
