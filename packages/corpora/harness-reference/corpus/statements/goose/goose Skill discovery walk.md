---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/discovery-walk
  object:
    recursive: true
    symlinks: file and directory symlinks followed, including targets outside the root
    cycles: prevented by canonical directory identity
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 goose Skill discovery walk](../../study-results/goose/2026-11-04%20goose%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[goose source skills discovery.rs (main at bfe8ccd)](../../documents/github.com/goose%20source%20skills%20discovery.rs%20%28main%20at%20bfe8ccd%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are skill folders in parent directories of the working directory searched? The source builds project roots from the working directory only.
imported_from: fact:skills/discovery-walk@goose#scope-[null,null,null]
---

Imported from `facts/goose/skills/discovery-walk.md`.

Open questions:
- Are skill folders in parent directories of the working directory searched? The source builds project roots from the working directory only.
