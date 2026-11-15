---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/discovery-walk
  object:
    recursive: true
    agents_skills_walk: working directory through ancestors, stopping at the repository root when one exists
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Pi Skill discovery walk](../../study-results/Pi/2026-11-04%20Pi%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-09 Pi skills agents dirs](../../study-results/Pi/2026-11-09%20Pi%20skills%20agents%20dirs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "Skills page: ancestors up to the repository root."
reportedIn:
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
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are symlinked skill folders followed during discovery? Only package manifest globs are documented (symlinked resource roots must be listed directly).
imported_from: fact:skills/discovery-walk@pi#scope-[null,null,null]
---

Imported from `facts/pi/skills/discovery-walk.md`.

Open questions:
- Are symlinked skill folders followed during discovery? Only package manifest globs are documented (symlinked resource roots must be listed directly).

Rechecked 2026-11-09 against the installed pi 1.5.0 and the v1.5.0 source tree.
