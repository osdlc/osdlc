---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: .cursor/rules/*.mdc
    attach_by: frontmatter alwaysApply, globs, description
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Cursor Rules and steering files](../../study-results/Cursor/2026-08-08%20Cursor%20Rules%20and%20steering%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs rules mdc](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20rules%20mdc.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Project rules are .mdc files in .cursor/rules.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:instructions/rules@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/instructions/rules.md`.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
