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
      - "[2026-11-09 Pi skills agents dirs](../../study-results/Pi/2026-11-09%20Pi%20skills%20agents%20dirs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "Skills page: .agents/skills walk."
  - hasEvidenceItems:
      - "[2026-11-09 Pi skills project dirs](../../study-results/Pi/2026-11-09%20Pi%20skills%20project%20dirs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "Source: project skills dir under .pi."
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
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
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/project-dirs@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/project-dirs.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0 and the v1.5.0 source tree.

Strength lowered 2026-11-09: the ancestor walk to the repository root rests on docs only; the source line shows the .pi skills directory.
