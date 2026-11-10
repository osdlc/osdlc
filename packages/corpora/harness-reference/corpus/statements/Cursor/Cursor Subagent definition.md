---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: subagents/definition
  object:
    location: .cursor/agents/*.md
    format: markdown with frontmatter
    also_reads: foreign agent dirs
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Cursor Subagent definition](../../study-results/Cursor/2026-08-08%20Cursor%20Subagent%20definition.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs subagent dirs](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20subagent%20dirs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Subagent file locations include Claude-compatible directories.
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
subject: "[Subagent definition](../../subjects/subagents/Subagent%20definition.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:subagents/definition@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/subagents/definition.md`.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
