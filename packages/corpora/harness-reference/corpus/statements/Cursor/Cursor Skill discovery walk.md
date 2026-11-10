---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skills/discovery-walk
  object:
    nested_subdirectories: true
    scoped_to: files under the directory holding the .cursor/skills folder
    recursive_within_root: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Cursor Skill discovery walk](../../study-results/Cursor/2026-11-04%20Cursor%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs skill nested](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20skill%20nested.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills root is walked recursively.
reportedIn:
  - "[Cursor docs Agent Skills](../../documents/cursor.com/Cursor%20docs%20Agent%20Skills.md)"
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
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are skill folders in parent directories above the working directory found, and are symlinked skill folders followed?
imported_from: fact:skills/discovery-walk@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/skills/discovery-walk.md`.

Open questions:
- Are skill folders in parent directories above the working directory found, and are symlinked skill folders followed?

Rechecked 2026-11-09 against the installed CLI and vendor docs.
