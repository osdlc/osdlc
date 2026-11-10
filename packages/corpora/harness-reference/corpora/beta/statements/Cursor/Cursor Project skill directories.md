---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - .agents/skills
      - .cursor/skills
    legacy:
      - .claude/skills
      - .codex/skills
    nested: true
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Cursor Project skill directories](../../study-results/Cursor/2026-08-08%20Cursor%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-10-01 Cursor Project skill directories](../../study-results/Cursor/2026-10-01%20Cursor%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Cursor docs Agent Skills](../../documents/cursor.com/Cursor%20docs%20Agent%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: disputed
imported_from: fact:skills/project-dirs@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/skills/project-dirs.md`.

The observations disagree on: dirs. The latest value is kept.
